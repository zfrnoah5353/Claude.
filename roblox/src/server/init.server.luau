-- Sweet Pets Factory : serveur
-- Gère les données des joueurs, la carte, les bonbons, les pets, les œufs,
-- la boutique, les quêtes et le boss. Les joueurs ne font qu'envoyer des
-- demandes (remotes) que le serveur vérifie.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")
local MarketplaceService = game:GetService("MarketplaceService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local PetModels = require(Shared:WaitForChild("PetModels"))

local rng = Random.new()

---------------------------------------------------------------------------
-- Remotes
---------------------------------------------------------------------------
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
local Action = Instance.new("RemoteEvent")
Action.Name = "Action"
Action.Parent = remotes
local StateEvent = Instance.new("RemoteEvent")
StateEvent.Name = "State"
StateEvent.Parent = remotes
local Fx = Instance.new("RemoteEvent")
Fx.Name = "Fx"
Fx.Parent = remotes
remotes.Parent = ReplicatedStorage

---------------------------------------------------------------------------
-- Outils de construction
---------------------------------------------------------------------------
local function part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	local parent = props.Parent
	for k, v in props do
		if k ~= "Parent" then
			(p :: any)[k] = v
		end
	end
	p.Parent = parent
	return p
end

local function deco(props: { [string]: any }): Part
	props.CanCollide = if props.CanCollide == nil then false else props.CanCollide
	props.CanQuery = false
	props.CanTouch = false
	return part(props)
end

local function billboard(adornee: BasePart, offset: Vector3, size: UDim2, maxDist: number?): BillboardGui
	local bb = Instance.new("BillboardGui")
	bb.Adornee = adornee
	bb.Size = size
	bb.StudsOffsetWorldSpace = offset
	bb.MaxDistance = maxDist or 120
	bb.LightInfluence = 0
	bb.Parent = adornee
	return bb
end

local INK = Color3.fromHex("3B2A5A")

local function label(parent: Instance, text: string, size: UDim2, pos: UDim2, textSize: number, color: Color3?): TextLabel
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Size = size
	t.Position = pos
	t.Font = Enum.Font.FredokaOne
	t.Text = text
	t.TextSize = textSize
	t.TextColor3 = color or Color3.new(1, 1, 1)
	t.TextScaled = false
	local st = Instance.new("UIStroke")
	st.Thickness = 3
	st.Color = INK
	st.Parent = t
	t.Parent = parent
	return t
end

---------------------------------------------------------------------------
-- Carte : une île par monde + l'arène du boss
---------------------------------------------------------------------------
local map = Instance.new("Folder")
map.Name = "Map"
map.Parent = workspace
local pileFolder = Instance.new("Folder")
pileFolder.Name = "Piles"
pileFolder.Parent = workspace

local FIELD_X = 150
local FIELD_Z0, FIELD_Z1 = -70, 140
local PLAZA_Z = -115

local eggStands: { [string]: Vector3 } = {}
local prompts: { ProximityPrompt } = {}

local function worldSpawn(w: number): CFrame
	local o = Config.Worlds[w].origin
	return CFrame.new(o + Vector3.new(0, 4, 30))
end

local function buildDecor(w, folder: Folder)
	local o = w.origin
	local r = Random.new(w.id * 977)
	local placed = 0
	while placed < 34 do
		local x = r:NextNumber(-185, 185)
		local z = r:NextNumber(-155, 155)
		local inField = math.abs(x) < FIELD_X + 12 and z > FIELD_Z0 - 12 and z < FIELD_Z1 + 12
		local inPlaza = z < PLAZA_Z + 45 and z > PLAZA_Z - 45 and math.abs(x) < 150
		if inField or inPlaza then
			continue
		end
		placed += 1
		local base = o + Vector3.new(x, 0, z)
		local k = r:NextInteger(1, 3)
		local h = r:NextNumber(8, 16)
		if w.theme == "meadow" then
			if k == 1 then
				deco({ Parent = folder, Size = Vector3.new(h, 1.2, 1.2), CFrame = CFrame.new(base + Vector3.new(0, h / 2, 0)) * CFrame.Angles(0, 0, math.rad(90)), Shape = Enum.PartType.Cylinder, Color = Color3.new(1, 1, 1), CanCollide = true })
				deco({ Parent = folder, Size = Vector3.new(1.5, 8, 8), CFrame = CFrame.new(base + Vector3.new(0, h + 3, 0)) * CFrame.Angles(0, math.rad(r:NextNumber(0, 180)), 0), Shape = Enum.PartType.Cylinder, Color = w.candy[r:NextInteger(1, #w.candy)] })
			elseif k == 2 then
				for i = 1, 3 do
					deco({ Parent = folder, Size = Vector3.one * r:NextNumber(5, 8), Position = base + Vector3.new(r:NextNumber(-4, 4), 3, r:NextNumber(-4, 4)), Shape = Enum.PartType.Ball, Color = Color3.fromHex(i == 2 and "8EDDB4" or "A6E8C4"), CanCollide = true })
				end
			else
				deco({ Parent = folder, Size = Vector3.new(1.6, h, 1.6), Position = base + Vector3.new(0, h / 2, 0), Color = Color3.new(1, 1, 1), CanCollide = true })
				for i = 0, math.floor(h / 2.5) do
					deco({ Parent = folder, Size = Vector3.new(1.7, 0.5, 1.7), CFrame = CFrame.new(base + Vector3.new(0, 1 + i * 2.5, 0)) * CFrame.Angles(0, 0, math.rad(25)), Color = Color3.fromHex("FF5A6E") })
				end
			end
		elseif w.theme == "choco" then
			deco({ Parent = folder, Size = Vector3.new(2.4, h, 2.4), Position = base + Vector3.new(0, h / 2, 0), Color = Color3.fromHex("6B4430"), CanCollide = true })
			for i = 1, 3 do
				deco({ Parent = folder, Size = Vector3.one * r:NextNumber(6, 9), Position = base + Vector3.new(r:NextNumber(-3, 3), h + r:NextNumber(-1, 2), r:NextNumber(-3, 3)), Shape = Enum.PartType.Ball, Color = Color3.fromHex(i == 1 and "5A3424" or "4A2C20") })
			end
		elseif w.theme == "ice" then
			deco({ Parent = folder, Size = Vector3.new(h * 0.8, 3, 3), CFrame = CFrame.new(base + Vector3.new(0, h * 0.4, 0)) * CFrame.Angles(0, 0, math.rad(90)), Shape = Enum.PartType.Cylinder, Color = Color3.fromHex("E8A85A"), CanCollide = true })
			for i = 1, k do
				deco({ Parent = folder, Size = Vector3.one * 5.5, Position = base + Vector3.new(0, h * 0.8 + (i - 1) * 4, 0), Shape = Enum.PartType.Ball, Color = w.candy[r:NextInteger(1, #w.candy)] })
			end
		else
			if k == 1 then
				local planet = deco({ Parent = folder, Size = Vector3.one * r:NextNumber(8, 14), Position = base + Vector3.new(0, h + 4, 0), Shape = Enum.PartType.Ball, Color = w.candy[r:NextInteger(1, #w.candy)] })
				deco({ Parent = folder, Size = Vector3.new(0.4, planet.Size.X * 1.7, planet.Size.X * 1.7), CFrame = planet.CFrame * CFrame.Angles(0, 0, math.rad(70)), Shape = Enum.PartType.Cylinder, Color = Color3.fromHex("FFF3B8"), Transparency = 0.3 })
			else
				deco({ Parent = folder, Size = Vector3.new(3, h, 3), CFrame = CFrame.new(base + Vector3.new(0, h / 2, 0)) * CFrame.Angles(0, math.rad(45), math.rad(r:NextNumber(-12, 12))), Color = w.candy[r:NextInteger(1, #w.candy)], Material = Enum.Material.Neon, Transparency = 0.25, CanCollide = true })
			end
		end
	end
end

local function addPrompt(parent: BasePart, action: string, object: string, kind: string, value: string): ProximityPrompt
	local pr = Instance.new("ProximityPrompt")
	pr.ActionText = action
	pr.ObjectText = object
	pr.KeyboardKeyCode = Enum.KeyCode.E
	pr.HoldDuration = 0
	pr.MaxActivationDistance = 14
	pr.RequiresLineOfSight = false
	pr:SetAttribute("Kind", kind)
	pr:SetAttribute("Value", value)
	pr.Parent = parent
	table.insert(prompts, pr)
	return pr
end

local function buildWorld(w)
	local o = w.origin
	local folder = Instance.new("Folder")
	folder.Name = w.name
	folder.Parent = map

	part({ Parent = folder, Name = "Ground", Size = Vector3.new(400, 4, 340), Position = o + Vector3.new(0, -2, 0), Color = w.ground })
	-- damier de dalles claires
	for gx = -4, 4 do
		for gz = -3, 3 do
			if (gx + gz) % 2 == 0 then
				deco({ Parent = folder, Size = Vector3.new(40, 0.1, 40), Position = o + Vector3.new(gx * 40, 0.05, gz * 40 + 10), Color = w.ground2 })
			end
		end
	end
	-- bordures
	for _, b in { { Vector3.new(0, 10, 172), Vector3.new(404, 24, 4) }, { Vector3.new(0, 10, -172), Vector3.new(404, 24, 4) }, { Vector3.new(202, 10, 0), Vector3.new(4, 24, 340) }, { Vector3.new(-202, 10, 0), Vector3.new(4, 24, 340) } } do
		part({ Parent = folder, Size = b[2], Position = o + b[1], Transparency = 1 })
		deco({ Parent = folder, Size = Vector3.new(b[2].X, 2, b[2].Z), Position = o + Vector3.new(b[1].X, 1, b[1].Z), Color = w.banner, CanCollide = true })
	end
	-- place centrale
	deco({ Parent = folder, Name = "Plaza", Size = Vector3.new(300, 0.3, 70), Position = o + Vector3.new(0, 0.15, PLAZA_Z), Color = w.plaza, CanCollide = true })
	-- panneau du monde
	local sign = deco({ Parent = folder, Size = Vector3.new(36, 9, 1.5), Position = o + Vector3.new(0, 14, PLAZA_Z - 30), Color = w.banner, CanCollide = true })
	local sg = Instance.new("SurfaceGui")
	sg.Face = Enum.NormalId.Back
	sg.CanvasSize = Vector2.new(720, 180)
	sg.LightInfluence = 0
	sg.Parent = sign
	label(sg, w.name, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), 90)
	for _, sx in { -17, 17 } do
		deco({ Parent = folder, Size = Vector3.new(1.5, 14, 1.5), Position = o + Vector3.new(sx, 7, PLAZA_Z - 30), Color = Color3.new(1, 1, 1), CanCollide = true })
	end

	-- socles d'œufs
	for i, eggId in w.eggs do
		local egg = Config.Eggs[eggId]
		local pos = o + Vector3.new(-30 + (i - 1) * 60, 0, PLAZA_Z)
		eggStands[eggId] = pos
		local ped = part({ Parent = folder, Name = "Stand_" .. eggId, Size = Vector3.new(3, 12, 12), CFrame = CFrame.new(pos + Vector3.new(0, 1.5, 0)) * CFrame.Angles(0, 0, math.rad(90)), Shape = Enum.PartType.Cylinder, Color = Color3.new(1, 1, 1) })
		ped:SetAttribute("Egg", eggId)
		local model = PetModels.egg(eggId, 2.2)
		model:PivotTo(CFrame.new(pos + Vector3.new(0, 7.8, 0)))
		model.Parent = folder
		local bb = billboard(ped, Vector3.new(0, 15, 0), UDim2.fromOffset(240, 80))
		label(bb, egg.name, UDim2.new(1, 0, 0.55, 0), UDim2.fromScale(0, 0), 32)
		label(bb, Config.fmt(egg.price) .. " pièces", UDim2.new(1, 0, 0.45, 0), UDim2.fromScale(0, 0.55), 26, Color3.fromHex("FFD54A"))
		addPrompt(ped, "Ouvrir", egg.name .. " · " .. Config.fmt(egg.price), "egg", eggId)
	end

	-- portail de rebirth
	local pp = o + Vector3.new(-105, 0, PLAZA_Z)
	for _, sx in { -7, 7 } do
		deco({ Parent = folder, Size = Vector3.new(2.5, 16, 2.5), Position = pp + Vector3.new(sx, 8, 0), Color = Color3.fromHex("6B5BD6"), CanCollide = true })
	end
	deco({ Parent = folder, Size = Vector3.new(17, 2.5, 2.5), Position = pp + Vector3.new(0, 16, 0), Color = Color3.fromHex("6B5BD6"), CanCollide = true })
	local disc = deco({ Parent = folder, Name = "Portal", Size = Vector3.new(0.6, 12, 12), CFrame = CFrame.new(pp + Vector3.new(0, 8, 0)) * CFrame.Angles(0, math.rad(90), 0), Shape = Enum.PartType.Cylinder, Color = Color3.fromHex("B69CFF"), Material = Enum.Material.Neon, Transparency = 0.2 })
	local pbb = billboard(disc, Vector3.new(0, 11, 0), UDim2.fromOffset(220, 50))
	label(pbb, "REBIRTH", UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), 34, Color3.fromHex("FFD54A"))
	local pbase = part({ Parent = folder, Size = Vector3.new(16, 1, 6), Position = pp + Vector3.new(0, 0.5, 4), Color = Color3.fromHex("8C7BFF") })
	addPrompt(pbase, "Rebirth", "Portail", "panel", "rebirth")

	-- porte des mondes
	local gp = o + Vector3.new(105, 0, PLAZA_Z)
	for _, sx in { -8, 8 } do
		deco({ Parent = folder, Size = Vector3.new(3, 18, 3), Position = gp + Vector3.new(sx, 9, 0), Color = Color3.new(1, 1, 1), CanCollide = true })
	end
	local top = deco({ Parent = folder, Size = Vector3.new(22, 4, 3), Position = gp + Vector3.new(0, 19, 0), Color = Color3.fromHex("7EE0B8"), CanCollide = true })
	local nextW = Config.Worlds[w.id + 1]
	deco({ Parent = folder, Size = Vector3.new(13, 16, 0.4), Position = gp + Vector3.new(0, 8, 0), Color = nextW and nextW.ground or Color3.fromHex("BDE9FF"), Material = Enum.Material.Neon, Transparency = 0.35 })
	local gbb = billboard(top, Vector3.new(0, 5, 0), UDim2.fromOffset(240, 50))
	label(gbb, "MONDES", UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), 34)
	local gbase = part({ Parent = folder, Size = Vector3.new(18, 1, 6), Position = gp + Vector3.new(0, 0.5, 4), Color = Color3.fromHex("7EE0B8") })
	addPrompt(gbase, "Voyager", "Mondes", "panel", "worlds")

	-- contour du champ de bonbons
	deco({ Parent = folder, Size = Vector3.new(FIELD_X * 2 + 16, 0.12, FIELD_Z1 - FIELD_Z0 + 16), Position = o + Vector3.new(0, 0.1, (FIELD_Z0 + FIELD_Z1) / 2), Color = w.ground:Lerp(Color3.new(1, 1, 1), 0.25), Transparency = 0.3 })

	buildDecor(w, folder)
end

for _, w in Config.Worlds do
	buildWorld(w)
end

-- Arène du boss
local arena = Instance.new("Folder")
arena.Name = "BossArena"
arena.Parent = map
local BO = Config.BOSS_ORIGIN
part({ Parent = arena, Size = Vector3.new(170, 4, 150), Position = BO + Vector3.new(0, -2, 0), Color = Color3.fromHex("3B2F6B") })
for i = 1, 5 do
	deco({ Parent = arena, Size = Vector3.new(0.2, 140 - i * 22, 140 - i * 22), CFrame = CFrame.new(BO + Vector3.new(0, 0.05 + i * 0.02, -15)) * CFrame.Angles(0, 0, math.rad(90)), Shape = Enum.PartType.Cylinder, Color = Color3.fromHex(i % 2 == 0 and "4B3E86" or "5A4BA0") })
end
for _, b in { { Vector3.new(0, 15, 76), Vector3.new(174, 34, 4) }, { Vector3.new(0, 15, -76), Vector3.new(174, 34, 4) }, { Vector3.new(86, 15, 0), Vector3.new(4, 34, 150) }, { Vector3.new(-86, 15, 0), Vector3.new(4, 34, 150) } } do
	part({ Parent = arena, Size = b[2], Position = BO + b[1], Color = Color3.fromHex("6B5BD6"), Transparency = 0.6 })
end
local ARENA_SPAWN = CFrame.new(BO + Vector3.new(0, 4, 45))
local GOLEM_POS = BO + Vector3.new(0, 0, -30)

---------------------------------------------------------------------------
-- Données des joueurs
---------------------------------------------------------------------------
local store: DataStore? = nil
pcall(function()
	store = DataStoreService:GetDataStore("SweetPetsFactory_v1")
end)

local function today(): string
	return os.date("!%Y-%m-%d") :: string
end

local function yesterday(): string
	return os.date("!%Y-%m-%d", os.time() - 86400) :: string
end

local function defaultData()
	return {
		v = 1,
		coins = 0,
		gems = 0,
		totalCoins = 0,
		rebirths = 0,
		world = 1,
		maxWorld = 1,
		pets = { { uid = 1, def = "gumdrop_bunny", tier = 0, lvl = 0, xp = 0, eq = true, lock = false, shiny = false, bonus = 0 } },
		nextUid = 2,
		discovered = { gumdrop_bunny = true },
		upgrades = {},
		passes = {},
		potions = {},
		quest = 1,
		questBase = 0,
		dailyDay = "",
		daily = {},
		giftDay = "",
		giftStreak = 0,
		stats = { hatched = 0, piles = 0, taps = 0, bosses = 0, golden = 0, rainbow = 0, upgrades = 0, play = 0, bestHit = 0 },
		indexClaim = 0,
		bossWins = 0,
		autoCollect = true,
		autoDelete = 0,
		lastSeen = 0,
	}
end

local function reconcile(data, template)
	for k, v in template do
		if data[k] == nil then
			data[k] = v
		elseif type(v) == "table" and type(data[k]) == "table" and k == "stats" then
			reconcile(data[k], v)
		end
	end
	return data
end

type Profile = {
	data: any,
	canSave: boolean,
	full: boolean,
	money: boolean,
	focus: number?,
	targets: { [number]: number },
	arrive: { [number]: number },
	eq: { any },
	lastTap: number,
	combo: number,
	comboT: number,
	lastHatch: number,
	autoHatch: string?,
	stunUntil: number,
	inBoss: boolean,
	robux: { [string]: boolean },
	cpsAcc: number,
	cpsHist: { number },
	cps: number,
	targetStr: string,
}

local profiles: { [Player]: Profile } = {}
-- multiplicateurs des événements « admin abusé » (modifiés par Admin.luau)
local adminEvents = { coins = 1, luck = 1, dmg = 1, speed = 1 }

---------------------------------------------------------------------------
-- Économie
---------------------------------------------------------------------------
local function hasPass(prof: Profile, id: string): boolean
	return prof.data.passes[id] == true or prof.robux[id] == true
end

local function up(prof: Profile, id: string): number
	return prof.data.upgrades[id] or 0
end

local function slots(prof: Profile): number
	return Config.BASE_SLOTS + up(prof, "slot") + (hasPass(prof, "vip") and 2 or 0)
end

local function storage(prof: Profile): number
	return Config.BASE_STORAGE + 25 * up(prof, "storage")
end

local function potionOn(prof: Profile, id: string): boolean
	return (prof.data.potions[id] or 0) > 0
end

local function damageMult(prof: Profile): number
	return (1 + 0.1 * up(prof, "power")) * (potionOn(prof, "dmg") and 2 or 1) * adminEvents.dmg
end

local function coinMult(prof: Profile): number
	local d = prof.data
	local m = Config.rebirthMult(d.rebirths) * (1 + 0.1 * up(prof, "coins")) * (1 + 0.05 * d.indexClaim)
	if hasPass(prof, "coins2") then
		m *= 2
	end
	if hasPass(prof, "vip") then
		m *= 1.1
	end
	if potionOn(prof, "coins") then
		m *= 2
	end
	return m * adminEvents.coins
end

local function luckMult(prof: Profile): number
	local m = 1 + 0.15 * up(prof, "luck")
	if hasPass(prof, "luck2") then
		m *= 2
	end
	if potionOn(prof, "luck") then
		m *= 2
	end
	return m * adminEvents.luck
end

local function teamDps(prof: Profile): number
	local sum = 0
	for _, p in prof.eq do
		sum += PetModels.power(p)
	end
	return sum * damageMult(prof)
end

local function tapDamage(prof: Profile): number
	return math.max(3, teamDps(prof) * 0.25) * (1 + 0.5 * up(prof, "tap"))
end

local function coinPerHP(w: number): number
	return 3 * Config.Worlds[w].coinMult
end

local function estimatedCps(prof: Profile): number
	return teamDps(prof) * coinPerHP(prof.data.world) * coinMult(prof) * 0.8
end

local function equippedCount(d): number
	local n = 0
	for _, p in d.pets do
		if p.eq then
			n += 1
		end
	end
	return n
end

local function findPet(d, uid: any)
	for _, p in d.pets do
		if p.uid == uid then
			return p
		end
	end
	return nil
end

local function addPet(d, def: string, tier: number, shiny: boolean)
	local p = { uid = d.nextUid, def = def, tier = tier, lvl = 0, xp = 0, eq = false, lock = false, shiny = shiny, bonus = 0 }
	d.nextUid += 1
	table.insert(d.pets, p)
	d.discovered[def] = true
	return p
end

local function removePets(d, uids: { [number]: boolean })
	local keep = {}
	for _, p in d.pets do
		if not uids[p.uid] then
			table.insert(keep, p)
		end
	end
	d.pets = keep
end

local function setWalkSpeed(plr: Player)
	local prof = profiles[plr]
	local char = plr.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if prof and hum then
		hum.WalkSpeed = if os.clock() < prof.stunUntil then 0 else 22 * (1 + 0.08 * up(prof, "speed")) * adminEvents.speed
	end
end

-- Recalcule la liste des pets équipés et la publie pour l'affichage chez tous les joueurs.
local function refreshEquipped(plr: Player)
	local prof = profiles[plr]
	if not prof then
		return
	end
	local eq = {}
	for _, p in prof.data.pets do
		if p.eq then
			table.insert(eq, p)
		end
	end
	table.sort(eq, function(a, b)
		return PetModels.power(a) > PetModels.power(b)
	end)
	prof.eq = eq
	local parts = {}
	for _, p in eq do
		table.insert(parts, string.format("%s:%d:%d", p.def, p.tier, p.shiny and 1 or 0))
	end
	plr:SetAttribute("PetsEquipped", table.concat(parts, "|"))
	prof.targets = {}
	prof.arrive = {}
	prof.full = true
end

local function toast(plr: Player, text: string, color: string?)
	Fx:FireClient(plr, "toast", { text = text, color = color })
end

local function addCoins(prof: Profile, v: number, track: boolean)
	prof.data.coins += v
	prof.data.totalCoins += v
	if track then
		prof.cpsAcc += v
	end
	prof.money = true
end

local function spend(plr: Player, prof: Profile, cost: number, gems: boolean): boolean
	local d = prof.data
	if gems then
		if d.gems < cost then
			toast(plr, "Pas assez de gemmes")
			return false
		end
		d.gems -= cost
	else
		if d.coins < cost then
			toast(plr, "Pas assez de pièces")
			return false
		end
		d.coins -= cost
	end
	prof.money = true
	prof.full = true
	return true
end

---------------------------------------------------------------------------
-- Quêtes
---------------------------------------------------------------------------
local function metric(prof: Profile, kind: string): number
	local d = prof.data
	local s = d.stats
	if kind == "piles" then
		return s.piles
	elseif kind == "hatch" then
		return s.hatched
	elseif kind == "equip" then
		return equippedCount(d)
	elseif kind == "coins" then
		return d.totalCoins
	elseif kind == "upgrade" then
		return s.upgrades
	elseif kind == "golden" then
		return s.golden
	elseif kind == "rainbow" then
		return s.rainbow
	elseif kind == "boss" then
		return s.bosses
	elseif kind == "world" then
		return d.maxWorld
	elseif kind == "rebirth" then
		return d.rebirths
	elseif kind == "taps" then
		return s.taps
	end
	return 0
end

local function questProgress(prof: Profile): (any, number)
	local q = Config.StarterQuests[prof.data.quest]
	if not q then
		return nil, 0
	end
	if Config.AbsoluteQuest[q.kind] then
		return q, metric(prof, q.kind)
	end
	return q, metric(prof, q.kind) - prof.data.questBase
end

local function roundNice(v: number): number
	local m = 1
	while v >= 100 do
		v /= 10
		m *= 10
	end
	return math.floor(v) * m
end

local function refreshDaily(prof: Profile)
	local d = prof.data
	local day = today()
	if d.dailyDay == day and #d.daily == 3 then
		return
	end
	d.dailyDay = day
	local seed = 0
	for i = 1, #day do
		seed = (seed * 31 + string.byte(day, i)) % 2147483647
	end
	local r = Random.new(seed)
	local kinds = { "piles", "hatch", "taps", "coins", "boss", "golden" }
	for i = #kinds, 2, -1 do
		local j = r:NextInteger(1, i)
		kinds[i], kinds[j] = kinds[j], kinds[i]
	end
	d.daily = {}
	for i = 1, 3 do
		local k = kinds[i]
		local target = 1
		if k == "piles" then
			target = 80 + r:NextInteger(0, 7) * 20
		elseif k == "hatch" then
			target = 15 + r:NextInteger(0, 4) * 5
		elseif k == "taps" then
			target = 150 + r:NextInteger(0, 5) * 50
		elseif k == "coins" then
			target = roundNice(math.max(5000, estimatedCps(prof) * 900))
		end
		table.insert(d.daily, { kind = k, target = target, base = metric(prof, k), gems = r:NextInteger(8, 15), claimed = false })
	end
	prof.full = true
end

local function indexCount(d): number
	local n = 0
	for _, id in Config.PetOrder do
		if d.discovered[id] then
			n += 1
		end
	end
	return n
end

---------------------------------------------------------------------------
-- Envoi de l'état aux joueurs
---------------------------------------------------------------------------
local function sendMoney(plr: Player)
	local prof = profiles[plr]
	if not prof then
		return
	end
	Fx:FireClient(plr, "money", { coins = prof.data.coins, gems = prof.data.gems, cps = prof.cps })
	prof.money = false
	local ls = plr:FindFirstChild("leaderstats")
	if ls then
		local c = ls:FindFirstChild("Pièces") :: StringValue?
		if c then
			c.Value = Config.fmt(prof.data.coins)
		end
		local r = ls:FindFirstChild("Rebirths") :: IntValue?
		if r then
			r.Value = prof.data.rebirths
		end
	end
end

local function sendState(plr: Player)
	local prof = profiles[plr]
	if not prof then
		return
	end
	local d = prof.data
	local pets = {}
	for _, p in d.pets do
		table.insert(pets, { uid = p.uid, def = p.def, tier = p.tier, shiny = p.shiny, lvl = p.lvl, xp = p.xp, eq = p.eq, lock = p.lock, bonus = p.bonus, power = PetModels.power(p) })
	end
	local q, qp = questProgress(prof)
	local daily = {}
	for _, dq in d.daily do
		table.insert(daily, { kind = dq.kind, target = dq.target, progress = metric(prof, dq.kind) - dq.base, gems = dq.gems, claimed = dq.claimed })
	end
	local passes = {}
	for _, ps in Config.Passes do
		passes[ps.id] = hasPass(prof, ps.id)
	end
	local giftNext = if d.giftDay == yesterday() then d.giftStreak % 7 + 1 else 1
	StateEvent:FireClient(plr, {
		coins = d.coins,
		gems = d.gems,
		totalCoins = d.totalCoins,
		rebirths = d.rebirths,
		world = d.world,
		maxWorld = d.maxWorld,
		pets = pets,
		discovered = d.discovered,
		upgrades = d.upgrades,
		passes = passes,
		potions = d.potions,
		quest = d.quest,
		questProgress = qp,
		questDone = q == nil,
		daily = daily,
		giftReady = d.giftDay ~= today(),
		giftNext = giftNext,
		giftStreak = d.giftStreak,
		giftCoins = roundNice(math.max(500, estimatedCps(prof) * 180)),
		indexClaim = d.indexClaim,
		indexCount = indexCount(d),
		stats = d.stats,
		autoCollect = d.autoCollect,
		autoDelete = d.autoDelete,
		slots = slots(prof),
		storage = storage(prof),
		dps = teamDps(prof),
		cps = prof.cps,
		coinMult = coinMult(prof),
		luck = luckMult(prof),
		tap = tapDamage(prof),
		rebirthCost = Config.rebirthCost(d.rebirths),
		autoHatch = prof.autoHatch,
		inBoss = prof.inBoss,
		canSave = prof.canSave,
	})
	prof.full = false
	sendMoney(plr)
end

---------------------------------------------------------------------------
-- Tas de bonbons
---------------------------------------------------------------------------
type Pile = {
	id: number,
	world: number,
	kind: number,
	hp: number,
	maxHp: number,
	pos: Vector3,
	model: Model,
	bar: Frame,
	bb: BillboardGui,
	contrib: { [Player]: number },
	dead: boolean,
	golden: boolean,
}

local piles: { [number]: Pile } = {}
local pileCount = { 0, 0, 0, 0 }
local nextPileId = 1
local PILE_SIZE = { 5, 8, 8 }
local CHEST_COLOR = { meadow = "FF8FB8", choco = "8A5A3C", ice = "7FD6FF", galaxy = "6B5BD6" }

local tapPile: (Player, Pile) -> ()

local function buildPileModel(w, kind: number, golden: boolean): (Model, BasePart)
	local model = Instance.new("Model")
	local s = PILE_SIZE[kind]
	local hit = part({ Parent = model, Name = "Hitbox", Size = Vector3.new(s + 1, s * 0.9, s + 1), Position = Vector3.new(0, s * 0.45, 0), Transparency = 1, CanCollide = false })
	model.PrimaryPart = hit
	local function col(): Color3
		local c = w.candy[rng:NextInteger(1, #w.candy)]
		if golden then
			c = c:Lerp(Color3.fromHex("FFD23F"), 0.75)
		end
		return c
	end
	if kind == 3 then
		local body = Color3.fromHex((CHEST_COLOR :: any)[w.theme])
		if golden then
			body = Color3.fromHex("FFD23F")
		end
		deco({ Parent = model, Size = Vector3.new(7, 4, 5), Position = Vector3.new(0, 2, 0), Color = body })
		deco({ Parent = model, Size = Vector3.new(7.4, 1.6, 5.4), Position = Vector3.new(0, 4.6, 0), Color = body:Lerp(Color3.new(1, 1, 1), 0.2) })
		deco({ Parent = model, Size = Vector3.new(1.2, 5.6, 5.6), Position = Vector3.new(0, 2.8, 0), Color = Color3.fromHex("FFD54A") })
		deco({ Parent = model, Size = Vector3.new(1.6, 1.6, 0.6), Position = Vector3.new(0, 3.2, -2.8), Color = Color3.fromHex("FFD54A") })
	else
		local layout = if kind == 1
			then { Vector3.new(-1.1, 0, 0.5), Vector3.new(1.1, 0, 0.5), Vector3.new(0, 1.4, -0.3) }
			else { Vector3.new(-2, 0, 0.8), Vector3.new(0, 0, 1.2), Vector3.new(2, 0, 0.8), Vector3.new(-1, 1.7, 0), Vector3.new(1, 1.7, 0), Vector3.new(0, 3.2, -0.2) }
		local r = kind == 1 and 1.5 or 1.8
		for _, p in layout do
			if w.theme == "choco" then
				deco({ Parent = model, Size = Vector3.new(r * 1.8, r * 0.9, r * 1.3), CFrame = CFrame.new(p + Vector3.new(0, r * 0.45, 0)) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), Color = col() })
			elseif w.theme == "galaxy" then
				deco({ Parent = model, Size = Vector3.one * r * 1.8, Position = p + Vector3.new(0, r * 0.9, 0), Shape = Enum.PartType.Ball, Color = col(), Material = Enum.Material.Neon, Transparency = 0.15 })
			else
				deco({ Parent = model, Size = Vector3.one * r * 2, Position = p + Vector3.new(0, r * 0.8, 0), Shape = Enum.PartType.Ball, Color = col() })
			end
		end
	end
	if golden then
		local sp = Instance.new("Sparkles")
		sp.SparkleColor = Color3.fromHex("FFF6C8")
		sp.Parent = hit
	end
	return model, hit
end

local function spawnPile(wi: number)
	local w = Config.Worlds[wi]
	local o = w.origin
	for _ = 1, 15 do
		local pos = o + Vector3.new(rng:NextNumber(-FIELD_X, FIELD_X), 0, rng:NextNumber(FIELD_Z0, FIELD_Z1))
		if (pos - (o + Vector3.new(0, 0, 30))).Magnitude < 12 then
			continue
		end
		local ok = true
		for _, p in piles do
			if p.world == wi and (p.pos - pos).Magnitude < 11 then
				ok = false
				break
			end
		end
		if not ok then
			continue
		end
		local roll = rng:NextNumber()
		local kind = if roll < 0.06 then 3 elseif roll < 0.36 then 2 else 1
		local golden = rng:NextNumber() < 0.01
		local hp = Config.PILE_HP[kind] * w.scale * rng:NextNumber(0.85, 1.15) * (golden and 3 or 1)
		local model, hit = buildPileModel(w, kind, golden)
		local id = nextPileId
		nextPileId += 1
		model.Name = tostring(id)
		model:SetAttribute("World", wi)
		model:PivotTo(CFrame.new(pos) * CFrame.Angles(0, rng:NextNumber(0, math.pi * 2), 0))

		local bb = billboard(hit, Vector3.new(0, PILE_SIZE[kind] + 1, 0), UDim2.fromOffset(90, 14), 80)
		bb.Enabled = false
		local back = Instance.new("Frame")
		back.Size = UDim2.fromScale(1, 1)
		back.BackgroundColor3 = Color3.new(1, 1, 1)
		back.BorderSizePixel = 0
		local c1 = Instance.new("UICorner")
		c1.CornerRadius = UDim.new(1, 0)
		c1.Parent = back
		local st = Instance.new("UIStroke")
		st.Thickness = 2
		st.Color = INK
		st.Parent = back
		back.Parent = bb
		local bar = Instance.new("Frame")
		bar.Size = UDim2.fromScale(1, 1)
		bar.BackgroundColor3 = Color3.fromHex("3DD68C")
		bar.BorderSizePixel = 0
		local c2 = Instance.new("UICorner")
		c2.CornerRadius = UDim.new(1, 0)
		c2.Parent = bar
		bar.Parent = back

		local cd = Instance.new("ClickDetector")
		cd.MaxActivationDistance = 70
		cd.Parent = hit

		local pile: Pile = { id = id, world = wi, kind = kind, hp = hp, maxHp = hp, pos = pos, model = model, bar = bar, bb = bb, contrib = {}, dead = false, golden = golden }
		piles[id] = pile
		pileCount[wi] += 1
		model.Parent = pileFolder
		cd.MouseClick:Connect(function(plr: Player)
			tapPile(plr, pile)
		end)
		return
	end
end

local function breakPile(pile: Pile)
	pile.dead = true
	pileCount[pile.world] -= 1
	piles[pile.id] = nil
	local total = 0
	for _, v in pile.contrib do
		total += v
	end
	for plr, dmg in pile.contrib do
		local prof = profiles[plr]
		if not prof or not plr.Parent then
			continue
		end
		local share = dmg / math.max(total, 1)
		local value = pile.maxHp * coinPerHP(pile.world) * coinMult(prof) * share
		if pile.golden then
			value *= 5
		end
		if rng:NextNumber() < 0.01 * up(prof, "golden") then
			value *= 5
		end
		addCoins(prof, value, true)
		local gems = 0
		if pile.kind == 3 and share > 0.3 and rng:NextNumber() < 0.25 then
			gems = rng:NextInteger(1, 3)
			prof.data.gems += gems
		end
		if share >= 0.15 then
			prof.data.stats.piles += 1
		end
		Fx:FireClient(plr, "coins", { pos = pile.pos, amount = value, gems = gems })
	end
	Fx:FireAllClients("break", { pos = pile.pos, world = pile.world })
	pile.model:Destroy()
end

local function damagePile(pile: Pile, plr: Player, amount: number)
	if pile.dead then
		return
	end
	pile.hp -= amount
	pile.contrib[plr] = (pile.contrib[plr] or 0) + amount
	if pile.hp <= 0 then
		breakPile(pile)
	else
		pile.bb.Enabled = true
		pile.bar.Size = UDim2.fromScale(math.clamp(pile.hp / pile.maxHp, 0.02, 1), 1)
	end
end

local function nextCombo(prof: Profile, now: number)
	if now < prof.comboT then
		prof.combo = math.min(prof.combo + 1, 50)
	else
		prof.combo = 1
	end
	prof.comboT = now + 0.9
end

tapPile = function(plr: Player, pile: Pile)
	local prof = profiles[plr]
	if not prof or pile.dead or prof.inBoss then
		return
	end
	local now = os.clock()
	if now - prof.lastTap < 0.08 or pile.world ~= prof.data.world then
		return
	end
	prof.lastTap = now
	nextCombo(prof, now)
	local dmg = tapDamage(prof) * (1 + 0.04 * (prof.combo - 1))
	local crit = rng:NextNumber() < 0.08 + 0.02 * up(prof, "crit")
	if crit then
		dmg *= 3
	end
	prof.data.stats.taps += 1
	prof.data.stats.bestHit = math.max(prof.data.stats.bestHit, dmg)
	prof.focus = pile.id
	Fx:FireClient(plr, "tap", { pos = pile.pos + Vector3.new(0, PILE_SIZE[pile.kind], 0), dmg = dmg, crit = crit, combo = prof.combo })
	damagePile(pile, plr, dmg)
end

for wi = 1, #Config.Worlds do
	for _ = 1, 24 do
		spawnPile(wi)
	end
end

---------------------------------------------------------------------------
-- Œufs
---------------------------------------------------------------------------
local function hrpOf(plr: Player): BasePart?
	local char = plr.Character
	return if char then char:FindFirstChild("HumanoidRootPart") :: BasePart? else nil
end

local function eggWeights(prof: Profile, egg): ({ number }, number)
	local luck = luckMult(prof)
	local total = 0
	local weights = {}
	for i, e in egg.pets do
		local wgt = e.chance
		if Config.Pets[e.pet].rarity >= Config.RARE then
			wgt *= luck
		end
		weights[i] = wgt
		total += wgt
	end
	return weights, total
end

local function realChance(prof: Profile, egg, petId: string): number
	local weights, total = eggWeights(prof, egg)
	for i, e in egg.pets do
		if e.pet == petId then
			return weights[i] / total * 100
		end
	end
	return 0
end

local function rollPet(prof: Profile, egg): string
	local weights, total = eggWeights(prof, egg)
	local r = rng:NextNumber() * total
	for i, e in egg.pets do
		r -= weights[i]
		if r <= 0 then
			return e.pet
		end
	end
	return egg.pets[1].pet
end

local function hatch(plr: Player, eggId: string, auto: boolean): boolean
	local prof = profiles[plr]
	local egg = Config.Eggs[eggId]
	if not prof or not egg then
		return false
	end
	local d = prof.data
	local now = os.clock()
	if now - prof.lastHatch < (auto and 2.4 or 1.0) then
		return false
	end
	local hrp = hrpOf(plr)
	local stand = eggStands[eggId]
	if not hrp or not stand or (hrp.Position - stand).Magnitude > 24 then
		return false
	end
	local n = 1
	if hasPass(prof, "triple") and d.coins >= egg.price * 3 then
		n = 3
	end
	local free = storage(prof) - #d.pets
	if free <= 0 then
		toast(plr, "Inventaire plein ! Supprime ou fusionne des pets.", "FF5A6E")
		prof.autoHatch = nil
		prof.full = true
		return false
	end
	n = math.min(n, free)
	if d.coins < egg.price * n then
		toast(plr, "Il te faut " .. Config.fmt(egg.price) .. " pièces")
		prof.autoHatch = nil
		prof.full = true
		return false
	end
	prof.lastHatch = now
	d.coins -= egg.price * n
	local results = {}
	for _ = 1, n do
		local petId = rollPet(prof, egg)
		local def = Config.Pets[petId]
		local isNew = not d.discovered[petId]
		local shiny = rng:NextNumber() < 1 / 200
		d.stats.hatched += 1
		local entry = { def = petId, shiny = shiny, new = isNew, deleted = false, power = def.power * (shiny and 1.5 or 1), chance = realChance(prof, egg, petId) }
		if def.rarity <= d.autoDelete and not shiny and not isNew then
			entry.deleted = true
		else
			local p = addPet(d, petId, 0, shiny)
			if equippedCount(d) < slots(prof) then
				p.eq = true
			end
		end
		table.insert(results, entry)
		if def.rarity >= Config.DIVINE then
			Fx:FireAllClients("toast", { text = "✨ " .. plr.DisplayName .. " a obtenu le pet DIVIN " .. def.name .. " ! ✨", color = "FFC93C" })
		elseif def.rarity >= Config.LEGENDARY then
			Fx:FireAllClients("toast", { text = plr.DisplayName .. " a obtenu " .. def.name .. " (" .. Config.Rarities[def.rarity].name .. ") !", color = if def.rarity >= Config.MYTHIC then "FF4F8B" else "FFB020" })
		end
	end
	refreshEquipped(plr)
	Fx:FireClient(plr, "hatch", { egg = eggId, results = results, auto = auto })
	return true
end

---------------------------------------------------------------------------
-- Boss Gummy Golem
---------------------------------------------------------------------------
local boss = {
	state = "idle",
	timer = 300,
	hp = 0,
	maxHp = 0,
	ends = 0,
	model = nil :: Model?,
	weak = nil :: BasePart?,
	weakT = 0,
	slamT = 0,
	warn = nil :: BasePart?,
	warnT = 0,
	dmg = {} :: { [Player]: number },
}

local function bossTap(plr: Player, weak: boolean)
	local prof = profiles[plr]
	if not prof or not prof.inBoss or boss.state ~= "open" then
		return
	end
	local now = os.clock()
	if now < prof.stunUntil or now - prof.lastTap < 0.08 then
		return
	end
	prof.lastTap = now
	nextCombo(prof, now)
	local dmg = tapDamage(prof) * (1 + 0.04 * (prof.combo - 1))
	local crit = rng:NextNumber() < 0.08 + 0.02 * up(prof, "crit")
	if weak then
		dmg *= 3
	end
	if crit then
		dmg *= 3
	end
	prof.data.stats.taps += 1
	boss.hp -= dmg
	boss.dmg[plr] = (boss.dmg[plr] or 0) + dmg
	local pos = if weak and boss.weak then boss.weak.Position else GOLEM_POS + Vector3.new(0, 16, 0)
	Fx:FireClient(plr, "tap", { pos = pos, dmg = dmg, crit = crit, weak = weak, combo = prof.combo })
end

local function spawnBoss()
	boss.state = "open"
	boss.ends = os.clock() + Config.BOSS_WINDOW + Config.BOSS_FIGHT
	boss.dmg = {}
	boss.maxHp = 3000
	boss.hp = boss.maxHp
	local model = PetModels.build("gummy_golem", 0, false, 9)
	model.Name = "GummyGolem"
	model:PivotTo(CFrame.new(GOLEM_POS + Vector3.new(0, 8.6, 0)))
	local hit = part({ Parent = model, Name = "Hitbox", Size = Vector3.new(19, 18, 17), Position = GOLEM_POS + Vector3.new(0, 8.6, 0), Transparency = 1 })
	local cd = Instance.new("ClickDetector")
	cd.MaxActivationDistance = 120
	cd.Parent = hit
	cd.MouseClick:Connect(function(plr)
		bossTap(plr, false)
	end)
	local weak = part({ Parent = model, Name = "Weak", Size = Vector3.one * 3.4, Shape = Enum.PartType.Ball, Position = GOLEM_POS + Vector3.new(4, 12, -9), Color = Color3.fromHex("FFD54A"), Material = Enum.Material.Neon, CanCollide = false })
	local wcd = Instance.new("ClickDetector")
	wcd.MaxActivationDistance = 120
	wcd.Parent = weak
	wcd.MouseClick:Connect(function(plr)
		bossTap(plr, true)
	end)
	boss.weak = weak
	boss.weakT = 4
	boss.slamT = 6
	model.Parent = arena
	boss.model = model
	workspace:SetAttribute("BossState", "open")
	Fx:FireAllClients("toast", { text = "Le Gummy Golem est apparu ! Va le combattre !", color = "FF5A6E" })
end

local function leaveBoss(plr: Player)
	local prof = profiles[plr]
	if not prof or not prof.inBoss then
		return
	end
	prof.inBoss = false
	plr:SetAttribute("InBoss", false)
	refreshEquipped(plr)
	local char = plr.Character
	if char then
		char:PivotTo(worldSpawn(prof.data.world))
	end
end

local function endBoss(win: boolean)
	local total = 0
	for _, v in boss.dmg do
		total += v
	end
	for plr, prof in profiles do
		if not prof.inBoss then
			continue
		end
		local d = prof.data
		local share = (boss.dmg[plr] or 0) / math.max(total, 1)
		local coins, gems = 0, 0
		local text
		if win then
			d.stats.bosses += 1
			d.bossWins += 1
			coins = math.max(1000, estimatedCps(prof) * 90)
			gems = 15 + 5 * d.rebirths
			text = "Tu gagnes " .. Config.fmt(coins) .. " pièces et " .. gems .. " gemmes."
			if share > 0 and (d.bossWins == 1 or rng:NextNumber() < 0.2) and #d.pets < storage(prof) then
				local best = 0
				for _, p in d.pets do
					best = math.max(best, PetModels.power(p))
				end
				local g = addPet(d, "gummy_golem", 0, rng:NextNumber() < 0.1)
				g.bonus = math.max(50, best * 2.5)
				if equippedCount(d) < slots(prof) then
					g.eq = true
				end
				text ..= " Le Gummy Golem rejoint ton équipe (puissance " .. Config.fmt(PetModels.power(g)) .. ") !"
			end
		else
			coins = math.floor(math.max(200, estimatedCps(prof) * 30) * (1 - boss.hp / boss.maxHp))
			text = "Le golem s'est enfui… Tu récupères " .. Config.fmt(coins) .. " pièces. Améliore tes pets et reviens !"
		end
		addCoins(prof, coins, false)
		d.gems += gems
		prof.full = true
		Fx:FireClient(plr, "popup", { title = if win then "VICTOIRE !" else "Temps écoulé", body = text })
		task.delay(3, function()
			if plr.Parent then
				leaveBoss(plr)
			end
		end)
	end
	if boss.model then
		boss.model:Destroy()
	end
	if boss.warn then
		boss.warn:Destroy()
	end
	boss.model, boss.weak, boss.warn = nil, nil, nil
	boss.state = "idle"
	boss.timer = Config.BOSS_INTERVAL
	workspace:SetAttribute("BossState", "idle")
end

local function joinBoss(plr: Player)
	local prof = profiles[plr]
	if not prof or boss.state ~= "open" or prof.inBoss then
		return
	end
	local char = plr.Character
	if not char then
		return
	end
	prof.inBoss = true
	prof.autoHatch = nil
	plr:SetAttribute("InBoss", true)
	-- les PV du golem s'adaptent à chaque combattant qui arrive
	local extra = teamDps(prof) * 40 + tapDamage(prof) * 40
	boss.maxHp += extra
	boss.hp += extra
	char:PivotTo(ARENA_SPAWN)
	prof.full = true
end

local function updateBoss(dt: number)
	if boss.state == "idle" then
		boss.timer -= dt
		workspace:SetAttribute("BossTime", boss.timer)
		if boss.timer <= 0 then
			spawnBoss()
		end
		return
	end
	local now = os.clock()
	workspace:SetAttribute("BossTime", boss.ends - now)
	workspace:SetAttribute("BossHP", math.max(0, boss.hp))
	workspace:SetAttribute("BossMax", boss.maxHp)
	local fighters = {}
	for plr, prof in profiles do
		if prof.inBoss then
			table.insert(fighters, plr)
		end
	end
	-- point faible qui bouge
	boss.weakT -= dt
	if boss.weakT <= 0 and boss.weak then
		boss.weakT = 4
		local a = rng:NextNumber(0, math.pi * 2)
		boss.weak.Position = GOLEM_POS + Vector3.new(math.cos(a) * 6, 10 + math.sin(a) * 4, -9)
	end
	-- attaque « écrasement » sur un joueur au hasard
	if #fighters > 0 then
		boss.slamT -= dt
		if boss.slamT <= 0 and not boss.warn then
			local target = fighters[rng:NextInteger(1, #fighters)]
			local hrp = hrpOf(target)
			if hrp then
				local pos = Vector3.new(hrp.Position.X, BO.Y + 0.2, hrp.Position.Z)
				boss.warn = deco({ Parent = arena, Size = Vector3.new(0.3, 28, 28), CFrame = CFrame.new(pos) * CFrame.Angles(0, 0, math.rad(90)), Shape = Enum.PartType.Cylinder, Color = Color3.fromHex("FF3355"), Material = Enum.Material.Neon, Transparency = 0.5 })
				boss.warnT = 1.5
			end
			boss.slamT = rng:NextNumber(5, 7)
		end
		local warnPart = boss.warn
		if warnPart then
			boss.warnT -= dt
			if boss.warnT <= 0 then
				local center = warnPart.Position
				warnPart:Destroy()
				boss.warn = nil
				Fx:FireAllClients("slam", { pos = center })
				for _, plr in fighters do
					local hrp = hrpOf(plr)
					local prof = profiles[plr]
					if hrp and prof and (Vector3.new(hrp.Position.X, center.Y, hrp.Position.Z) - center).Magnitude < 14 then
						prof.stunUntil = os.clock() + 2
						prof.combo = 0
						setWalkSpeed(plr)
						Fx:FireClient(plr, "stun", {})
					end
				end
			end
		end
	end
	if boss.hp <= 0 then
		endBoss(true)
	elseif now >= boss.ends then
		endBoss(false)
	end
end

---------------------------------------------------------------------------
-- Boucle des pets (dégâts, cibles, expérience)
---------------------------------------------------------------------------
local PET_TICK = 0.2

local function petTick()
	local assigned: { [number]: number } = {}
	for _, prof in profiles do
		for _, id in prof.targets do
			assigned[id] = (assigned[id] or 0) + 1
		end
	end
	local now = os.clock()
	for plr, prof in profiles do
		local hrp = hrpOf(plr)
		if not hrp then
			continue
		end
		local d = prof.data
		local mult = damageMult(prof)
		local function gainXp(p)
			if p.lvl < 25 then
				p.xp += PET_TICK
				local need = 25 + 15 * p.lvl
				if p.xp >= need then
					p.xp -= need
					p.lvl += 1
					prof.full = true
					Fx:FireClient(plr, "levelup", { name = Config.Pets[p.def].name, lvl = p.lvl })
				end
			end
		end
		if prof.inBoss then
			if boss.state == "open" then
				for _, p in prof.eq do
					local dmg = PetModels.power(p) * mult * PET_TICK
					boss.hp -= dmg
					boss.dmg[plr] = (boss.dmg[plr] or 0) + dmg
					gainXp(p)
				end
			end
			continue
		end
		local focus = if prof.focus then piles[prof.focus] else nil
		if focus and (focus.dead or focus.world ~= d.world or (focus.pos - hrp.Position).Magnitude > 120) then
			focus = nil
			prof.focus = nil
		end
		local strs = {}
		for slot, p in prof.eq do
			local tid = prof.targets[slot]
			local t = if tid then piles[tid] else nil
			if t and (t.dead or t.world ~= d.world or (t.pos - hrp.Position).Magnitude > 120) then
				t = nil
			end
			if focus then
				t = focus
			elseif not t and d.autoCollect then
				local best, bd = nil, 50
				for _, pile in piles do
					if pile.world == d.world and (assigned[pile.id] or 0) < 2 then
						local dist = (pile.pos - hrp.Position).Magnitude
						if dist < bd then
							best, bd = pile, dist
						end
					end
				end
				t = best
				if t then
					assigned[t.id] = (assigned[t.id] or 0) + 1
				end
			end
			local newId = if t then t.id else nil
			if newId ~= prof.targets[slot] then
				prof.targets[slot] = newId :: any
				prof.arrive[slot] = now + (if t then (t.pos - hrp.Position).Magnitude / 45 else 0)
			end
			table.insert(strs, tostring(newId or 0))
			if t and now >= (prof.arrive[slot] or 0) then
				damagePile(t, plr, PetModels.power(p) * mult * PET_TICK)
				gainXp(p)
			end
		end
		local s = table.concat(strs, ",")
		if s ~= prof.targetStr then
			prof.targetStr = s
			plr:SetAttribute("PetTargets", s)
		end
	end
end

---------------------------------------------------------------------------
-- Actions des joueurs
---------------------------------------------------------------------------
local handlers: { [string]: (Player, Profile, any) -> () } = {}

handlers.equip = function(plr, prof, uid)
	local p = findPet(prof.data, uid)
	if not p then
		return
	end
	if p.eq then
		p.eq = false
	elseif equippedCount(prof.data) < slots(prof) then
		p.eq = true
	else
		toast(plr, "Tous tes emplacements sont pleins")
		return
	end
	refreshEquipped(plr)
end

handlers.equipBest = function(plr, prof)
	local list = table.clone(prof.data.pets)
	table.sort(list, function(a, b)
		return PetModels.power(a) > PetModels.power(b)
	end)
	for i, p in list do
		p.eq = i <= slots(prof)
	end
	refreshEquipped(plr)
end

handlers.lock = function(plr, prof, uid)
	local p = findPet(prof.data, uid)
	if p then
		p.lock = not p.lock
		prof.full = true
	end
end

handlers.delete = function(plr, prof, uid)
	local p = findPet(prof.data, uid)
	if p and not p.lock then
		removePets(prof.data, { [p.uid] = true })
		refreshEquipped(plr)
	end
end

local function junk(prof: Profile): { [number]: boolean }
	local limit = math.max(Config.UNCOMMON, prof.data.autoDelete)
	local out = {}
	for _, p in prof.data.pets do
		if not p.eq and not p.lock and p.tier == 0 and not p.shiny and (p.bonus or 0) == 0 and Config.Pets[p.def].rarity <= limit then
			out[p.uid] = true
		end
	end
	return out
end

handlers.deleteJunk = function(plr, prof)
	removePets(prof.data, junk(prof))
	refreshEquipped(plr)
end

handlers.autoDelete = function(plr, prof, n)
	if type(n) == "number" and n >= 0 and n <= Config.RARE then
		prof.data.autoDelete = math.floor(n)
		prof.full = true
	end
end

handlers.autoCollect = function(plr, prof, on)
	prof.data.autoCollect = on == true
	prof.full = true
end

handlers.fuse = function(plr, prof, uid)
	local d = prof.data
	local p = findPet(d, uid)
	if not p or p.tier >= 2 or (p.bonus or 0) > 0 then
		return
	end
	local others = {}
	for _, o in d.pets do
		if o.uid ~= p.uid and o.def == p.def and o.tier == p.tier and not o.lock and (o.bonus or 0) == 0 then
			table.insert(others, o)
		end
	end
	if #others < 4 then
		toast(plr, "Il faut 5 pets identiques")
		return
	end
	-- on garde en priorité les pets équipés hors de la fusion
	table.sort(others, function(a, b)
		return (not a.eq) and b.eq
	end)
	local group = { p, others[1], others[2], others[3], others[4] }
	local rm, wasEq, shiny = {}, false, false
	for _, g in group do
		rm[g.uid] = true
		wasEq = wasEq or g.eq
		shiny = shiny or g.shiny
	end
	removePets(d, rm)
	local np = addPet(d, p.def, p.tier + 1, shiny)
	np.eq = wasEq
	if np.tier == 1 then
		d.stats.golden += 1
		toast(plr, Config.Pets[p.def].name .. " doré obtenu !", "FFD54A")
	else
		d.stats.rainbow += 1
		toast(plr, Config.Pets[p.def].name .. " arc-en-ciel obtenu !", "FF8FB8")
	end
	refreshEquipped(plr)
	Fx:FireClient(plr, "fused", { uid = np.uid })
end

handlers.hatch = function(plr, prof, eggId)
	if type(eggId) == "string" then
		hatch(plr, eggId, false)
	end
end

handlers.autoHatch = function(plr, prof, eggId)
	if type(eggId) == "string" and Config.Eggs[eggId] and hasPass(prof, "auto") then
		prof.autoHatch = eggId
	else
		prof.autoHatch = nil
	end
	prof.full = true
end

handlers.upgrade = function(plr, prof, id)
	for _, u in Config.Upgrades do
		if u.id == id then
			local lvl = up(prof, id)
			if lvl >= u.max then
				return
			end
			if spend(plr, prof, Config.upgradeCost(u, lvl), u.gem) then
				prof.data.upgrades[id] = lvl + 1
				prof.data.stats.upgrades += 1
				setWalkSpeed(plr)
				Fx:FireClient(plr, "bought", {})
				if id == "slot" then
					refreshEquipped(plr)
				end
			end
			return
		end
	end
end

handlers.potion = function(plr, prof, id)
	for _, p in Config.Potions do
		if p.id == id and spend(plr, prof, p.gems, true) then
			prof.data.potions[id] = (prof.data.potions[id] or 0) + Config.POTION_TIME
			Fx:FireClient(plr, "bought", {})
		end
	end
end

handlers.pass = function(plr, prof, id)
	for _, p in Config.Passes do
		if p.id == id and not hasPass(prof, id) and (Config.GamePassIds :: any)[id] == 0 then
			if spend(plr, prof, p.gems, true) then
				prof.data.passes[id] = true
				toast(plr, "Pass " .. p.name .. " activé !", "3DD68C")
				refreshEquipped(plr)
				Fx:FireClient(plr, "bought", {})
			end
		end
	end
end

local function teleport(plr: Player, prof: Profile, w: number)
	prof.data.world = w
	prof.focus = nil
	prof.autoHatch = nil
	local char = plr.Character
	if char then
		char:PivotTo(worldSpawn(w))
	end
	refreshEquipped(plr)
end

handlers.unlock = function(plr, prof)
	local d = prof.data
	local nextW = Config.Worlds[d.maxWorld + 1]
	if not nextW then
		return
	end
	if spend(plr, prof, nextW.unlock, false) then
		d.maxWorld += 1
		toast(plr, nextW.name .. " débloqué !", "FFD54A")
		teleport(plr, prof, d.maxWorld)
	end
end

handlers.teleport = function(plr, prof, w)
	if type(w) == "number" and w >= 1 and w <= prof.data.maxWorld and not prof.inBoss then
		teleport(plr, prof, math.floor(w))
	end
end

handlers.rebirth = function(plr, prof)
	local d = prof.data
	local cost = Config.rebirthCost(d.rebirths)
	if d.coins < cost or prof.inBoss then
		return
	end
	d.rebirths += 1
	d.coins = 0
	d.maxWorld = 1
	d.gems += 10 * d.rebirths
	teleport(plr, prof, 1)
	prof.money = true
	Fx:FireClient(plr, "rebirth", { n = d.rebirths, mult = Config.rebirthMult(d.rebirths) })
end

handlers.quest = function(plr, prof)
	local q, prog = questProgress(prof)
	if not q or prog < q.goal then
		return
	end
	local d = prof.data
	addCoins(prof, q.coins, false)
	d.gems += q.gems
	d.quest += 1
	local nq = Config.StarterQuests[d.quest]
	if nq then
		d.questBase = metric(prof, nq.kind)
	end
	prof.full = true
	Fx:FireClient(plr, "claimed", {})
end

handlers.daily = function(plr, prof, i)
	local dq = if type(i) == "number" then prof.data.daily[i] else nil
	if dq and not dq.claimed and metric(prof, dq.kind) - dq.base >= dq.target then
		dq.claimed = true
		prof.data.gems += dq.gems
		prof.full = true
		Fx:FireClient(plr, "claimed", {})
	end
end

handlers.gift = function(plr, prof)
	local d = prof.data
	if d.giftDay == today() then
		return
	end
	local day = if d.giftDay == yesterday() then d.giftStreak % 7 + 1 else 1
	if day == 1 then
		addCoins(prof, roundNice(math.max(500, estimatedCps(prof) * 180)), false)
	elseif day == 2 then
		d.gems += 10
	elseif day == 3 then
		d.potions.coins = (d.potions.coins or 0) + Config.POTION_TIME
	elseif day == 4 then
		d.gems += 15
	elseif day == 5 then
		d.potions.luck = (d.potions.luck or 0) + Config.POTION_TIME
	elseif day == 6 then
		d.gems += 25
	else
		d.gems += 50
		d.potions.dmg = (d.potions.dmg or 0) + Config.POTION_TIME
	end
	d.giftDay = today()
	d.giftStreak = day
	prof.full = true
	Fx:FireClient(plr, "claimed", {})
end

handlers.index = function(plr, prof)
	local d = prof.data
	local m = Config.IndexMilestones[d.indexClaim + 1]
	if m and indexCount(d) >= math.min(m.need, #Config.PetOrder) then
		d.indexClaim += 1
		d.gems += m.gems
		prof.full = true
		Fx:FireClient(plr, "claimed", {})
	end
end

handlers.joinBoss = function(plr, prof)
	joinBoss(plr)
end

handlers.leaveBoss = function(plr, prof)
	leaveBoss(plr)
end

Action.OnServerEvent:Connect(function(plr: Player, name: any, arg: any)
	local prof = profiles[plr]
	if not prof or type(name) ~= "string" then
		return
	end
	local h = handlers[name]
	if h then
		local ok, err = pcall(h, plr, prof, arg)
		if not ok then
			warn("[SweetPets] action", name, err)
		end
	end
end)

-- Invites de proximité : œufs et panneaux
for _, pr in prompts do
	pr.Triggered:Connect(function(plr)
		local kind = pr:GetAttribute("Kind")
		local value = pr:GetAttribute("Value") :: string
		if kind == "egg" then
			hatch(plr, value, false)
		else
			Fx:FireClient(plr, "panel", { name = value })
		end
	end)
end

---------------------------------------------------------------------------
-- Robux (si configurés dans Config)
---------------------------------------------------------------------------
MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(plr, passId, bought)
	if not bought then
		return
	end
	local prof = profiles[plr]
	if not prof then
		return
	end
	for id, gid in Config.GamePassIds :: any do
		if gid ~= 0 and gid == passId then
			prof.robux[id] = true
			toast(plr, "Merci ! Pass activé.", "3DD68C")
			refreshEquipped(plr)
		end
	end
end)

MarketplaceService.ProcessReceipt = function(info)
	local plr = Players:GetPlayerByUserId(info.PlayerId)
	local prof = if plr then profiles[plr] else nil
	if not plr or not prof then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	for _, prod in Config.GemProducts do
		if prod.id ~= 0 and prod.id == info.ProductId then
			prof.data.gems += prod.gems
			prof.full = true
			toast(plr, "+" .. prod.gems .. " gemmes, merci !", "7FD6FF")
			return Enum.ProductPurchaseDecision.PurchaseGranted
		end
	end
	return Enum.ProductPurchaseDecision.NotProcessedYet
end

---------------------------------------------------------------------------
-- Connexion / déconnexion / sauvegarde
---------------------------------------------------------------------------
local function save(plr: Player)
	local prof = profiles[plr]
	local ds = store
	if not prof or not prof.canSave or not ds then
		return
	end
	prof.data.lastSeen = os.time()
	local ok, err = pcall(function()
		ds:SetAsync("p_" .. plr.UserId, prof.data)
	end)
	if not ok then
		warn("[SweetPets] sauvegarde impossible :", err)
	end
end

local function onCharacter(plr: Player, char: Model)
	local prof = profiles[plr]
	if not prof then
		return
	end
	local hrp = char:WaitForChild("HumanoidRootPart", 10)
	local hum = char:WaitForChild("Humanoid", 10)
	if not hrp or not hum then
		return
	end
	prof.inBoss = false
	prof.stunUntil = 0
	plr:SetAttribute("InBoss", false)
	task.wait(0.1)
	char:PivotTo(worldSpawn(prof.data.world))
	setWalkSpeed(plr)
	refreshEquipped(plr)
end

local function onPlayer(plr: Player)
	local data = nil
	local canSave = true
	local ds = store
	if ds then
		local ok, result = false, nil
		for _ = 1, 3 do
			ok, result = pcall(function()
				return ds:GetAsync("p_" .. plr.UserId)
			end)
			if ok then
				break
			end
			task.wait(1)
		end
		if ok then
			data = result
		else
			-- on ne sauvegarde pas pour ne pas écraser une partie qu'on n'a pas pu lire
			canSave = false
			warn("[SweetPets] chargement impossible, partie temporaire :", result)
		end
	else
		canSave = false
	end
	if type(data) ~= "table" then
		data = defaultData()
	else
		reconcile(data, defaultData())
	end
	if not plr.Parent then
		return
	end
	local prof: Profile = {
		data = data,
		canSave = canSave,
		full = true,
		money = true,
		focus = nil,
		targets = {},
		arrive = {},
		eq = {},
		lastTap = 0,
		combo = 0,
		comboT = 0,
		lastHatch = 0,
		autoHatch = nil,
		stunUntil = 0,
		inBoss = false,
		robux = {},
		cpsAcc = 0,
		cpsHist = {},
		cps = 0,
		targetStr = "",
	}
	profiles[plr] = prof
	if data.world > data.maxWorld then
		data.world = data.maxWorld
	end
	for id, gid in Config.GamePassIds :: any do
		if gid ~= 0 then
			local ok, owns = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(plr.UserId, gid)
			end)
			if ok and owns then
				prof.robux[id] = true
			end
		end
	end

	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local c = Instance.new("StringValue")
	c.Name = "Pièces"
	c.Parent = ls
	local r = Instance.new("IntValue")
	r.Name = "Rebirths"
	r.Parent = ls
	ls.Parent = plr

	refreshDaily(prof)
	refreshEquipped(plr)

	-- gains hors ligne
	if data.lastSeen > 0 then
		local away = os.time() - data.lastSeen
		if away > 120 then
			local capped = math.min(away, 8 * 3600)
			local earn = math.floor(estimatedCps(prof) * capped * 0.25)
			if earn > 0 then
				addCoins(prof, earn, false)
				task.delay(4, function()
					Fx:FireClient(plr, "popup", { title = "Bon retour !", body = "Pendant ton absence (" .. Config.fmtTime(capped) .. "), tes pets ont récolté " .. Config.fmt(earn) .. " pièces." })
				end)
			end
		end
	end

	plr.CharacterAdded:Connect(function(char)
		onCharacter(plr, char)
	end)
	if plr.Character then
		task.spawn(onCharacter, plr, plr.Character)
	end
	sendState(plr)
end

---------------------------------------------------------------------------
-- Panneau admin (IA, actions manuelles, admin abusé, annonces traduites)
---------------------------------------------------------------------------
require(script:WaitForChild("Admin")).start({
	Config = Config,
	profiles = profiles,
	events = adminEvents,
	remotes = remotes,
	Fx = Fx,
	toast = toast,
	addCoins = addCoins,
	addPet = addPet,
	teleport = teleport,
	setWalkSpeed = setWalkSpeed,
	defaultData = defaultData,
	spawnBoss = function(): boolean
		if boss.state ~= "idle" then
			return false
		end
		spawnBoss()
		return true
	end,
})

Players.PlayerAdded:Connect(onPlayer)
for _, plr in Players:GetPlayers() do
	task.spawn(onPlayer, plr)
end

Players.PlayerRemoving:Connect(function(plr)
	save(plr)
	profiles[plr] = nil
end)

game:BindToClose(function()
	for plr in profiles do
		task.spawn(save, plr)
	end
	task.wait(if RunService:IsStudio() then 1 else 3)
end)

---------------------------------------------------------------------------
-- Boucles
---------------------------------------------------------------------------
local acc, secAcc, spawnAcc, saveAcc = 0, 0, 0, 0
RunService.Heartbeat:Connect(function(dt)
	acc += dt
	secAcc += dt
	spawnAcc += dt
	saveAcc += dt
	if acc >= PET_TICK then
		acc -= PET_TICK
		petTick()
		updateBoss(PET_TICK)
		for plr, prof in profiles do
			-- auto-éclosion
			local auto = prof.autoHatch
			if auto then
				local stand = eggStands[auto]
				local hrp = hrpOf(plr)
				if not stand or not hrp or (hrp.Position - stand).Magnitude > 24 or prof.inBoss then
					prof.autoHatch = nil
					prof.full = true
				else
					hatch(plr, auto, true)
				end
			end
			if prof.full then
				sendState(plr)
			elseif prof.money then
				sendMoney(plr)
			end
		end
	end
	if spawnAcc >= 0.5 then
		spawnAcc = 0
		for wi = 1, #Config.Worlds do
			if pileCount[wi] < 26 then
				spawnPile(wi)
			end
		end
	end
	if secAcc >= 1 then
		secAcc -= 1
		for plr, prof in profiles do
			local d = prof.data
			d.stats.play += 1
			for id, left in d.potions do
				if left > 0 then
					d.potions[id] = left - 1
					if d.potions[id] <= 0 then
						d.potions[id] = nil
						toast(plr, "Une potion vient de se terminer")
						prof.full = true
					end
				end
			end
			table.insert(prof.cpsHist, prof.cpsAcc)
			prof.cpsAcc = 0
			if #prof.cpsHist > 10 then
				table.remove(prof.cpsHist, 1)
			end
			local sum = 0
			for _, v in prof.cpsHist do
				sum += v
			end
			prof.cps = sum / #prof.cpsHist
			if d.dailyDay ~= today() then
				refreshDaily(prof)
			end
			-- les quêtes dépendent de compteurs : on rafraîchit l'état toutes les 2 s
			if d.stats.play % 2 == 0 then
				prof.full = true
			end
			if prof.stunUntil > 0 and os.clock() >= prof.stunUntil then
				prof.stunUntil = 0
				setWalkSpeed(plr)
			end
		end
	end
	if saveAcc >= 90 then
		saveAcc = 0
		for plr in profiles do
			task.spawn(save, plr)
		end
	end
end)
