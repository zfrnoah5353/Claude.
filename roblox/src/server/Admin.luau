-- Panneau admin (côté serveur) : actions manuelles, assistant IA (Claude), événements
-- « admin abusé » et annonces traduites dans la langue de chaque joueur.
-- Toutes les actions sont vérifiées ici : un joueur qui n'est pas admin ne peut rien faire.

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local ServerStorage = game:GetService("ServerStorage")

local Admin = {}

local API_URL = "https://api.anthropic.com/v1/messages"
local MODEL = "claude-opus-5-5"
local SECRET_NAME = "anthropic_api_key"

-- Libellés et icônes des événements « admin abusé »
local ABUSE = {
	coins_x = { label = "Pièces x%s", icon = "🟡", default = 10 },
	luck_x = { label = "Chance x%s", icon = "🍀", default = 10 },
	damage_x = { label = "Dégâts x%s", icon = "💪", default = 10 },
	speed_x = { label = "Vitesse x%s", icon = "⚡", default = 2 },
	coin_rain = { label = "Pluie de pièces", icon = "💰", default = 30 },
	low_gravity = { label = "Gravité lunaire", icon = "🌙", default = 0.25 },
	giant = { label = "Géants", icon = "🦖", default = 3 },
	tiny = { label = "Minis", icon = "🐜", default = 0.4 },
	disco = { label = "Disco", icon = "🪩", default = 1 },
	night = { label = "Nuit étoilée", icon = "🌌", default = 1 },
}

function Admin.start(api)
	local Config = api.Config
	local profiles = api.profiles
	local events = api.events -- multiplicateurs lus par l'économie du serveur
	local Fx = api.Fx

	local active: { [string]: any } = {} -- kind -> { value, ends }
	local logLines: { string } = {}
	local chats: { [number]: { any } } = {}
	local busy: { [number]: boolean } = {}

	local function log(who: string, text: string)
		table.insert(logLines, 1, os.date("!%H:%M") .. " · " .. who .. " · " .. text)
		if #logLines > 40 then
			table.remove(logLines)
		end
	end

	-------------------------------------------------------------------------
	-- Qui est admin ?
	-------------------------------------------------------------------------
	local function isAdmin(plr: Player): boolean
		if RunService:IsStudio() then
			return true
		end
		if table.find(Config.AdminIds, plr.UserId) then
			return true
		end
		if game.CreatorType == Enum.CreatorType.User then
			return plr.UserId == game.CreatorId
		end
		local ok, rank = pcall(plr.GetRankInGroupAsync, plr, game.CreatorId)
		return ok and rank >= 255
	end

	local function markAdmin(plr: Player)
		task.spawn(function()
			plr:SetAttribute("IsAdmin", isAdmin(plr))
		end)
	end
	Players.PlayerAdded:Connect(markAdmin)
	for _, plr in Players:GetPlayers() do
		markAdmin(plr)
	end

	-------------------------------------------------------------------------
	-- Cibles : "all", "me", ou un nom (début du pseudo ou du nom affiché)
	-------------------------------------------------------------------------
	local function targets(admin: Player, who: any): { Player }
		local s = string.lower(tostring(who or "me"))
		if s == "me" or s == "moi" or s == "" then
			return { admin }
		end
		if s == "all" or s == "tous" or s == "tout le monde" then
			return Players:GetPlayers()
		end
		local out = {}
		for _, p in Players:GetPlayers() do
			if string.sub(string.lower(p.Name), 1, #s) == s or string.sub(string.lower(p.DisplayName), 1, #s) == s then
				table.insert(out, p)
			end
		end
		return out
	end

	local function names(list: { Player }): string
		local n = {}
		for _, p in list do
			table.insert(n, p.DisplayName)
		end
		return table.concat(n, ", ")
	end

	local function refresh(plr: Player)
		local prof = profiles[plr]
		if prof then
			prof.full = true
			prof.money = true
		end
	end

	-------------------------------------------------------------------------
	-- Clé API : secret Roblox (jeu publié) ou StringValue dans ServerStorage (tests)
	-------------------------------------------------------------------------
	local function apiKey(): any
		local ok, secret = pcall(function()
			return HttpService:GetSecret(SECRET_NAME)
		end)
		if ok and secret then
			return secret
		end
		local v = ServerStorage:FindFirstChild("ClaudeApiKey")
		if v and v:IsA("StringValue") and v.Value ~= "" then
			return v.Value
		end
		return nil
	end

	-- JSONEncode transforme une table vide en [] : l'API attend {} pour ces champs
	local function encode(body: any): string
		local s = HttpService:JSONEncode(body)
		s = string.gsub(s, '"input":%[%]', '"input":{}')
		s = string.gsub(s, '"properties":%[%]', '"properties":{}')
		return s
	end

	local function callClaude(body: any): (any, string?)
		local key = apiKey()
		if not key then
			return nil, "Clé API manquante : ajoute le secret « " .. SECRET_NAME .. " » (ou une StringValue ClaudeApiKey dans ServerStorage pour tester)."
		end
		body.model = MODEL
		body.fallbacks = "default"
		local ok, res = pcall(function()
			return HttpService:RequestAsync({
				Url = API_URL,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["x-api-key"] = key,
					["anthropic-version"] = "2026-10-21",
					["anthropic-beta"] = "server-side-fallback-2026-07-01",
				},
				Body = encode(body),
			})
		end)
		if not ok then
			return nil, "Requête impossible (" .. tostring(res) .. "). Active Game Settings › Security › Allow HTTP Requests."
		end
		if not res.Success then
			return nil, string.format("Erreur de l'API (%d) : %s", res.StatusCode, string.sub(res.Body, 1, 300))
		end
		local okJson, data = pcall(HttpService.JSONDecode, HttpService, res.Body)
		if not okJson then
			return nil, "Réponse illisible de l'API"
		end
		return data, nil
	end

	-------------------------------------------------------------------------
	-- Traduction des annonces (une seule requête pour toutes les langues présentes)
	-------------------------------------------------------------------------
	local function translate(text: string, locales: { string }): { [string]: string }?
		local props, required = {}, {}
		for _, loc in locales do
			props[loc] = { type = "string" }
			table.insert(required, loc)
		end
		local data = callClaude({
			max_tokens = 4000,
			output_config = {
				effort = "low",
				format = { type = "json_schema", schema = { type = "object", properties = props, required = required, additionalProperties = false } },
			},
			system = "Tu traduis les annonces d'un jeu Roblox pour enfants et ados. Pour chaque code de langue Roblox demandé (ex. en-us, es-es, pt-br), donne la traduction naturelle du message, en gardant les emojis, les noms propres et le ton. Si la langue est celle du message, recopie-le.",
			messages = { { role = "user", content = "Langues : " .. table.concat(locales, ", ") .. "\nMessage :\n" .. text } },
		})
		if not data or data.stop_reason ~= "end_turn" then
			return nil
		end
		for _, block in data.content do
			if block.type == "text" then
				local ok, map = pcall(HttpService.JSONDecode, HttpService, block.text)
				if ok and type(map) == "table" then
					return map
				end
			end
		end
		return nil
	end

	local function announce(from: string, text: string, translateIt: boolean, color: string?)
		local list = Players:GetPlayers()
		local map: { [string]: string }? = nil
		if translateIt then
			local seen, locales = {}, {}
			for _, p in list do
				local loc = string.lower(p.LocaleId)
				if not seen[loc] then
					seen[loc] = true
					table.insert(locales, loc)
				end
			end
			map = translate(text, locales)
		end
		for _, p in list do
			local msg = (map and map[string.lower(p.LocaleId)]) or text
			Fx:FireClient(p, "announce", { text = msg, from = from, color = color or "FF8FB8" })
		end
		return if translateIt and not map then "Annonce envoyée sans traduction (IA indisponible)" else "Annonce envoyée à " .. #list .. " joueur(s)" .. (if map then ", traduite" else "")
	end

	-------------------------------------------------------------------------
	-- Événements « admin abusé »
	-------------------------------------------------------------------------
	local function broadcastAbuse()
		local list = {}
		for kind, ev in active do
			local info = ABUSE[kind]
			table.insert(list, { kind = kind, icon = info.icon, label = string.format(info.label, tostring(ev.value)), left = math.max(0, math.floor(ev.ends - os.clock())) })
		end
		Fx:FireAllClients("abuse", { list = list })
	end

	local function applyScale(char: Model?, s: number)
		if char and math.abs(char:GetScale() - s) > 0.01 then
			pcall(char.ScaleTo, char, s)
		end
	end

	local function stopAbuse(kind: string)
		active[kind] = nil
		if kind == "coins_x" then
			events.coins = 1
		elseif kind == "luck_x" then
			events.luck = 1
		elseif kind == "damage_x" then
			events.dmg = 1
		elseif kind == "speed_x" then
			events.speed = 1
			for _, p in Players:GetPlayers() do
				api.setWalkSpeed(p)
			end
		elseif kind == "low_gravity" then
			workspace.Gravity = 196.2
		elseif kind == "giant" or kind == "tiny" then
			if not active.giant and not active.tiny then
				for _, p in Players:GetPlayers() do
					applyScale(p.Character, 1)
				end
			end
		elseif kind == "night" then
			Lighting.ClockTime = 14
		end
	end

	local function startAbuse(kind: string, value: number?, minutes: number?): string
		local info = ABUSE[kind]
		if not info then
			return "Événement inconnu : " .. tostring(kind)
		end
		local v = tonumber(value) or info.default
		local mins = math.clamp(tonumber(minutes) or 5, 0.25, 60)
		if kind == "giant" then
			active.tiny = nil
			v = math.clamp(v, 1, 5)
		elseif kind == "tiny" then
			active.giant = nil
			v = math.clamp(v, 0.25, 1)
		elseif kind == "low_gravity" then
			v = math.clamp(v, 0.05, 1)
			workspace.Gravity = 196.2 * v
		elseif kind == "night" then
			Lighting.ClockTime = 0
		elseif string.sub(kind, -2) == "_x" then
			v = math.clamp(v, 1, 100)
		end
		active[kind] = { value = v, ends = os.clock() + mins * 60 }
		if kind == "coins_x" then
			events.coins = v
		elseif kind == "luck_x" then
			events.luck = v
		elseif kind == "damage_x" then
			events.dmg = v
		elseif kind == "speed_x" then
			events.speed = math.clamp(v, 1, 5)
			for _, p in Players:GetPlayers() do
				api.setWalkSpeed(p)
			end
		end
		broadcastAbuse()
		Fx:FireAllClients("toast", { text = "🔥 ADMIN ABUSE : " .. info.icon .. " " .. string.format(info.label, tostring(v)) .. " pendant " .. mins .. " min !", color = "FF4F8B" })
		return string.format("%s lancé (%s, %s min)", string.format(info.label, tostring(v)), tostring(v), tostring(mins))
	end

	-- boucle : fin des événements, pluie de pièces, taille des personnages
	task.spawn(function()
		while true do
			task.wait(1)
			local changed = false
			for kind, ev in active do
				if os.clock() >= ev.ends then
					stopAbuse(kind)
					changed = true
				end
			end
			local rain = active.coin_rain
			if rain then
				for plr, prof in profiles do
					api.addCoins(prof, math.max(50, prof.cps * rain.value), false)
				end
				Fx:FireAllClients("coinRain", {})
			end
			local sc = (active.giant and active.giant.value) or (active.tiny and active.tiny.value)
			if sc then
				for _, p in Players:GetPlayers() do
					applyScale(p.Character, sc)
				end
			end
			if changed then
				broadcastAbuse()
			end
		end
	end)
	Players.PlayerAdded:Connect(function()
		task.wait(3)
		broadcastAbuse()
	end)

	-------------------------------------------------------------------------
	-- Actions (les mêmes pour les boutons et pour l'IA)
	-------------------------------------------------------------------------
	local petIds = {}
	for _, id in Config.PetOrder do
		table.insert(petIds, id)
	end
	local potionIds = {}
	for _, p in Config.Potions do
		table.insert(potionIds, p.id)
	end
	local abuseKinds = {}
	for k in ABUSE do
		table.insert(abuseKinds, k)
	end
	table.sort(abuseKinds)

	local PLAYER = { type = "string", description = "« me » (l'admin), « all » (tout le monde) ou le début du pseudo d'un joueur" }
	local TOOLS = {}
	local function tool(name: string, description: string, props: any, required: { string }, run: (Player, any) -> string)
		TOOLS[name] = { name = name, description = description, input_schema = { type = "object", properties = props, required = required }, run = run }
	end

	tool("list_players", "Liste les joueurs du serveur avec leurs pièces, gemmes, pets, monde et rebirths.", { detail = { type = "boolean", description = "Inutilisé, laisser vide" } }, {}, function()
		local lines = {}
		for _, p in Players:GetPlayers() do
			local prof = profiles[p]
			if prof then
				local d = prof.data
				table.insert(lines, string.format("%s (@%s) : %s pièces, %d gemmes, %d pets, monde %d/%d, %d rebirths", p.DisplayName, p.Name, Config.fmt(d.coins), d.gems, #d.pets, d.world, d.maxWorld, d.rebirths))
			end
		end
		return if #lines > 0 then table.concat(lines, "\n") else "Aucun joueur chargé"
	end)

	tool("give_currency", "Donne (ou retire si négatif) des pièces ou des gemmes.", {
		player = PLAYER,
		currency = { type = "string", enum = { "coins", "gems" } },
		amount = { type = "number", description = "Quantité, négative pour retirer" },
	}, { "player", "currency", "amount" }, function(admin, a)
		local list = targets(admin, a.player)
		local amount = tonumber(a.amount) or 0
		for _, p in list do
			local prof = profiles[p]
			if prof then
				if a.currency == "gems" then
					prof.data.gems = math.max(0, math.floor(prof.data.gems + amount))
				elseif amount >= 0 then
					api.addCoins(prof, amount, false)
				else
					prof.data.coins = math.max(0, prof.data.coins + amount)
				end
				refresh(p)
				api.toast(p, string.format("Un admin t'a donné %s %s", Config.fmt(amount), if a.currency == "gems" then "gemmes" else "pièces"), "FFD54A")
			end
		end
		return string.format("%s %s → %s", Config.fmt(amount), a.currency, if #list > 0 then names(list) else "personne (joueur introuvable)")
	end)

	tool("give_pet", "Donne un ou plusieurs pets. tier : 0 normal, 1 doré, 2 arc-en-ciel.", {
		player = PLAYER,
		pet = { type = "string", enum = petIds },
		tier = { type = "integer", enum = { 0, 1, 2 } },
		shiny = { type = "boolean" },
		count = { type = "integer", description = "1 à 20" },
	}, { "player", "pet" }, function(admin, a)
		local def = Config.Pets[a.pet]
		if not def then
			return "Pet inconnu : " .. tostring(a.pet)
		end
		local list = targets(admin, a.player)
		local n = math.clamp(math.floor(tonumber(a.count) or 1), 1, 20)
		local tier = math.clamp(math.floor(tonumber(a.tier) or 0), 0, 2)
		for _, p in list do
			local prof = profiles[p]
			if prof then
				for _ = 1, n do
					api.addPet(prof.data, a.pet, tier, a.shiny == true)
				end
				refresh(p)
				api.toast(p, "Un admin t'a donné " .. n .. " × " .. def.name .. " !", "FF8FB8")
			end
		end
		return string.format("%d × %s → %s", n, def.name, if #list > 0 then names(list) else "personne")
	end)

	tool("give_potion", "Donne une potion active pendant un nombre de minutes.", {
		player = PLAYER,
		potion = { type = "string", enum = potionIds },
		minutes = { type = "number" },
	}, { "player", "potion" }, function(admin, a)
		local list = targets(admin, a.player)
		local secs = math.clamp(math.floor((tonumber(a.minutes) or 10) * 60), 30, 6 * 3600)
		for _, p in list do
			local prof = profiles[p]
			if prof then
				prof.data.potions[a.potion] = (prof.data.potions[a.potion] or 0) + secs
				refresh(p)
			end
		end
		return string.format("Potion %s (%d min) → %s", tostring(a.potion), secs // 60, names(list))
	end)

	tool("teleport", "Téléporte des joueurs dans un monde (débloque ce monde si besoin).", {
		player = PLAYER,
		world = { type = "integer", description = "1 à " .. #Config.Worlds },
	}, { "player", "world" }, function(admin, a)
		local w = math.clamp(math.floor(tonumber(a.world) or 1), 1, #Config.Worlds)
		local list = targets(admin, a.player)
		for _, p in list do
			local prof = profiles[p]
			if prof and not prof.inBoss then
				prof.data.maxWorld = math.max(prof.data.maxWorld, w)
				api.teleport(p, prof, w)
				refresh(p)
			end
		end
		return "Téléportation vers " .. Config.Worlds[w].name .. " : " .. names(list)
	end)

	tool("spawn_boss", "Fait apparaître le boss Gummy Golem tout de suite.", { now = { type = "boolean", description = "Inutilisé" } }, {}, function()
		return if api.spawnBoss() then "Boss apparu" else "Le boss est déjà là"
	end)

	tool("announce", "Affiche une annonce en grand chez tous les joueurs et dans le chat. translate = traduire dans la langue de chaque joueur.", {
		message = { type = "string" },
		translate = { type = "boolean" },
	}, { "message" }, function(admin, a)
		return announce(admin.DisplayName, tostring(a.message), a.translate ~= false)
	end)

	tool("abuse_event", "Lance un événement « admin abusé » pour tout le serveur. coins_x/luck_x/damage_x/speed_x : multiplicateur (value). coin_rain : chaque seconde, value secondes de gains offertes. low_gravity : fraction de la gravité normale. giant/tiny : taille des joueurs. disco, night : ambiance.", {
		kind = { type = "string", enum = abuseKinds },
		value = { type = "number" },
		minutes = { type = "number", description = "Durée, 0,25 à 60 min (5 par défaut)" },
	}, { "kind" }, function(_, a)
		return startAbuse(a.kind, a.value, a.minutes)
	end)

	tool("pet_rain", "Pluie de pets : chaque joueur reçoit un pet au hasard de la rareté choisie (1 Commun … 7 Divin).", {
		rarity = { type = "integer", description = "1 à 7" },
	}, { "rarity" }, function()
		return "" -- remplacé plus bas (a besoin de la liste par rareté)
	end)
	local byRarity: { [number]: { string } } = {}
	for _, id in Config.PetOrder do
		local r = Config.Pets[id].rarity
		byRarity[r] = byRarity[r] or {}
		table.insert(byRarity[r], id)
	end
	TOOLS.pet_rain.run = function(_, a)
		local r = math.clamp(math.floor(tonumber(a.rarity) or 5), 1, 7)
		local pool = byRarity[r]
		for _, p in Players:GetPlayers() do
			local prof = profiles[p]
			if prof and pool then
				local id = pool[math.random(1, #pool)]
				api.addPet(prof.data, id, 0, false)
				refresh(p)
				api.toast(p, "🎁 Pluie de pets ! Tu reçois " .. Config.Pets[id].name .. " !", "FF8FB8")
			end
		end
		Fx:FireAllClients("coinRain", {})
		return "Pluie de pets " .. Config.Rarities[r].name .. " pour tout le serveur"
	end

	tool("stop_events", "Arrête tous les événements « admin abusé » en cours.", { now = { type = "boolean", description = "Inutilisé" } }, {}, function()
		for kind in active do
			stopAbuse(kind)
		end
		broadcastAbuse()
		return "Tous les événements sont arrêtés"
	end)

	tool("kick", "Expulse un joueur du serveur. Seulement si l'admin l'a clairement demandé.", {
		player = PLAYER,
		reason = { type = "string" },
	}, { "player" }, function(admin, a)
		local list = targets(admin, a.player)
		if tostring(a.player):lower() == "all" then
			return "Refusé : on n'expulse pas tout le serveur d'un coup"
		end
		for _, p in list do
			if p ~= admin then
				p:Kick(tostring(a.reason or "Expulsé par un admin"))
			end
		end
		return "Expulsé : " .. names(list)
	end)

	tool("reset_player", "Remet à zéro la partie d'un joueur. Irréversible : confirm doit valoir true, et seulement si l'admin l'a explicitement confirmé.", {
		player = PLAYER,
		confirm = { type = "boolean" },
	}, { "player", "confirm" }, function(admin, a)
		if a.confirm ~= true then
			return "Pas fait : il faut confirmer (confirm = true)"
		end
		local list = targets(admin, a.player)
		if tostring(a.player):lower() == "all" then
			return "Refusé : la remise à zéro se fait joueur par joueur"
		end
		for _, p in list do
			local prof = profiles[p]
			if prof then
				local fresh = api.defaultData()
				for k in prof.data do
					prof.data[k] = nil
				end
				for k, v in fresh do
					prof.data[k] = v
				end
				api.teleport(p, prof, 1)
				refresh(p)
			end
		end
		return "Partie remise à zéro : " .. names(list)
	end)

	local toolList = {}
	for _, name in { "list_players", "give_currency", "give_pet", "give_potion", "teleport", "spawn_boss", "announce", "abuse_event", "pet_rain", "stop_events", "kick", "reset_player" } do
		local t = TOOLS[name]
		table.insert(toolList, { name = t.name, description = t.description, input_schema = t.input_schema })
	end

	local function runTool(admin: Player, name: string, input: any): string
		local t = TOOLS[name]
		if not t then
			return "Action inconnue : " .. tostring(name)
		end
		local ok, res = pcall(t.run, admin, if type(input) == "table" then input else {})
		local text = if ok then tostring(res) else "Erreur : " .. tostring(res)
		log(admin.DisplayName, text)
		return text
	end

	-------------------------------------------------------------------------
	-- Assistant IA
	-------------------------------------------------------------------------
	local catalog = {}
	for r = 1, 7 do
		local ids = {}
		local pool: { string } = byRarity[r] or {}
		for _, id in pool do
			table.insert(ids, id .. " (" .. Config.Pets[id].name .. ")")
		end
		table.insert(catalog, Config.Rarities[r].name .. " : " .. table.concat(ids, ", "))
	end
	local worlds = {}
	for i, w in Config.Worlds do
		table.insert(worlds, i .. " " .. w.name)
	end
	local SYSTEM = table.concat({
		"Tu es l'assistant admin du jeu Roblox « Sweet Pets Factory » (simulateur de pets sur le thème des bonbons et de la mythologie).",
		"L'admin te parle en français. Fais ce qu'il demande avec les outils, puis réponds en une ou deux phrases courtes qui disent ce qui a été fait.",
		"Quand la demande est claire, agis sans demander. Si un nom de joueur est ambigu, appelle list_players d'abord.",
		"kick et reset_player sont graves : ne les utilise que si l'admin les demande clairement ; pour reset_player, demande confirmation avant si l'admin ne l'a pas déjà donnée.",
		"Pour une annonce, laisse translate à true sauf si l'admin dit le contraire : chaque joueur la reçoit dans sa langue.",
		"Mondes : " .. table.concat(worlds, ", ") .. ".",
		"Potions : " .. table.concat(potionIds, ", ") .. ".",
		"Pets par rareté (id et nom) :\n" .. table.concat(catalog, "\n"),
	}, "\n")

	local function ask(admin: Player, text: string): (string, { string })
		local hist = chats[admin.UserId]
		if not hist or #hist > 40 then
			hist = {}
			chats[admin.UserId] = hist
		end
		table.insert(hist, { role = "user", content = text })
		local done = {}
		for _ = 1, 8 do
			local data, err = callClaude({
				max_tokens = 4000,
				output_config = { effort = "low" },
				system = { { type = "text", text = SYSTEM, cache_control = { type = "ephemeral" } } },
				tools = toolList,
				messages = hist,
			})
			if not data then
				table.remove(hist) -- la question n'a pas abouti : on la retire pour pouvoir réessayer
				return err or "Erreur inconnue", done
			end
			table.insert(hist, { role = "assistant", content = data.content })
			if data.stop_reason == "refusal" then
				chats[admin.UserId] = nil
				return "L'IA a refusé cette demande.", done
			end
			if data.stop_reason ~= "tool_use" then
				local parts = {}
				for _, b in data.content do
					if b.type == "text" then
						table.insert(parts, b.text)
					end
				end
				return table.concat(parts, "\n"), done
			end
			local results = {}
			for _, b in data.content do
				if b.type == "tool_use" then
					local res = runTool(admin, b.name, b.input)
					table.insert(done, res)
					table.insert(results, { type = "tool_result", tool_use_id = b.id, content = res })
				end
			end
			table.insert(hist, { role = "user", content = results })
		end
		return "J'ai fait plusieurs actions, je m'arrête là.", done
	end

	-------------------------------------------------------------------------
	-- Remote : le panneau du joueur appelle ici
	-------------------------------------------------------------------------
	local rf = Instance.new("RemoteFunction")
	rf.Name = "Admin"
	rf.Parent = api.remotes
	rf.OnServerInvoke = function(plr: Player, kind: any, a: any, b: any)
		if not isAdmin(plr) then
			return { ok = false, text = "Tu n'es pas admin." }
		end
		if kind == "state" then
			return { ok = true, log = logLines, hasKey = apiKey() ~= nil }
		elseif kind == "act" and type(a) == "string" then
			return { ok = true, text = runTool(plr, a, b) }
		elseif kind == "ai" and type(a) == "string" then
			if busy[plr.UserId] then
				return { ok = false, text = "Une demande est déjà en cours…" }
			end
			busy[plr.UserId] = true
			local okAsk, reply, done = pcall(ask, plr, string.sub(a, 1, 1000))
			busy[plr.UserId] = nil
			if not okAsk then
				return { ok = false, text = "Erreur : " .. tostring(reply) }
			end
			return { ok = true, text = reply, done = done }
		elseif kind == "aiReset" then
			chats[plr.UserId] = nil
			return { ok = true, text = "Nouvelle conversation" }
		end
		return { ok = false, text = "Demande inconnue" }
	end
end

return Admin
