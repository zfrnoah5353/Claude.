-- Steal a Sweet Egg : côté joueur
-- Interface, modèles 3D des pets et des œufs dans les bases, pets portés par les
-- voleurs, effets et sons. Le joueur n'envoie que des demandes au serveur.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local MarketplaceService = game:GetService("MarketplaceService")
local SoundService = game:GetService("SoundService")
local Debris = game:GetService("Debris")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local PetModels = require(Shared:WaitForChild("PetModels"))
local UI = require(script:WaitForChild("UI"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local Action = Remotes:WaitForChild("Action") :: RemoteEvent
local StateEvent = Remotes:WaitForChild("State") :: RemoteEvent
local Fx = Remotes:WaitForChild("Fx") :: RemoteEvent
local plotFolder = workspace:WaitForChild("Plots")

local fmt = Config.fmt
local S: any = nil
local muted = false
local THUMB = 120
local PET_SIZE = 1.6 -- taille des pets sur les socles

local function send(name: string, arg: any?)
	Action:FireServer(name, arg)
end

---------------------------------------------------------------------------
-- Sons (bibliothèque publique Roblox). Pour en changer un, mets un Sound du même
-- nom dans SoundService › Sounds.
---------------------------------------------------------------------------
local SOUNDS: { [string]: { id: number, vol: number, start: number? } } = {
	click = { id = 15675059323, vol = 0.5 }, -- Roblox_UI_Bright_Click
	open = { id = 15675012262, vol = 0.35 }, -- Roblox_UI_Whoosh_04
	close = { id = 17208186900, vol = 0.35 }, -- Roblox GUI - Back
	error = { id = 17208353912, vol = 0.5 }, -- Roblox GUI - Negative
	coin = { id = 17208319162, vol = 0.45 }, -- Roblox GUI - Pickup
	buy = { id = 17208380755, vol = 0.5 }, -- Roblox GUI - Purchase
	pop = { id = 17208204604, vol = 0.45 }, -- Roblox GUI - Bubble
	quest = { id = 17208361335, vol = 0.5 }, -- Roblox GUI - Notification High
	crack = { id = 9113959071, vol = 0.6, start = 0.16 }, -- l'œuf craque
	reveal = { id = 15675043410, vol = 0.5 }, -- Roblox_UI_Tonal_Stinger
	reveal_rare = { id = 17208327798, vol = 0.5 }, -- Roblox GUI - Aura
	legend = { id = 1845411858, vol = 0.55, start = 0.24 }, -- APM « Top Prize »
	divine = { id = 9047024260, vol = 0.6 }, -- APM « Epic Win - Stinger 1 »
	swing = { id = 15675024286, vol = 0.45 }, -- Roblox_UI_Whoosh_01
	bonk = { id = 9113537815, vol = 0.7 }, -- Boink Pop Blip
	alarm = { id = 17208353912, vol = 0.8 }, -- Roblox GUI - Negative
}
local custom = SoundService:FindFirstChild("Sounds")
local soundObjs: { [string]: Sound } = {}
for name, info in SOUNDS do
	local c = custom and custom:FindFirstChild(name)
	local id = if c and c:IsA("Sound") and c.SoundId ~= "" then c.SoundId else "rbxassetid://" .. info.id
	soundObjs[name] = UI.new("Sound", { Name = "Sfx_" .. name, SoundId = id, Volume = info.vol, Parent = SoundService })
end
local lastSound: { [string]: number } = {}
local coinStreak = 0
local function play(name: string, speed: number?)
	if muted then
		return
	end
	local t = os.clock()
	local last = lastSound[name] or 0
	if t - last < 0.06 then
		return
	end
	lastSound[name] = t
	local snd = soundObjs[name]
	if not snd then
		return
	end
	if name == "coin" then
		coinStreak = if t - last < 1.2 then math.min(coinStreak + 1, 12) else 0
		snd.PlaybackSpeed = 2 ^ (coinStreak / 12)
	else
		snd.PlaybackSpeed = speed or 1
	end
	local start = SOUNDS[name].start
	if start then
		snd.TimePosition = start
		snd:Play()
	else
		SoundService:PlayLocalSound(snd)
	end
end
UI.onClick = function()
	play("click")
end
UI.onError = function()
	play("error")
end

local music = UI.new("Sound", { Name = "Music", Looped = true, Volume = Config.Music.volume, SoundId = "rbxassetid://" .. Config.Music.id, Parent = SoundService })
music:Play()

---------------------------------------------------------------------------
-- Interface
---------------------------------------------------------------------------
local gui = UI.new("ScreenGui", { Name = "StealUI", ResetOnSpawn = false, IgnoreGuiInset = true, ZIndexBehavior = Enum.ZIndexBehavior.Sibling, Parent = player:WaitForChild("PlayerGui") })
local root = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Parent = gui })
local uiScale = UI.new("UIScale", { Parent = root })
local function rescale()
	local cam = workspace.CurrentCamera
	local v = if cam then cam.ViewportSize else Vector2.new(1280, 720)
	uiScale.Scale = math.clamp(math.min(v.X / 1280, v.Y / 720), 0.55, 1.25)
	root.Size = UDim2.fromOffset(v.X / uiScale.Scale, v.Y / uiScale.Scale)
end
rescale()
if workspace.CurrentCamera then
	workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)
end

-- argent en haut au centre
local cashBox = UI.box(root, { Size = UDim2.fromOffset(300, 74), Position = UDim2.new(0.5, 0, 0, 14), AnchorPoint = Vector2.new(0.5, 0), Color = Color3.fromHex("3DD68C") })
local cashLbl = UI.text(cashBox, { Text = "$0", TextSize = 40, Color = UI.WHITE, Outline = 3, Size = UDim2.new(1, 0, 0, 46), Position = UDim2.fromOffset(0, 2) })
local incomeLbl = UI.text(cashBox, { Text = "+$0/s", TextSize = 20, Color = Color3.fromHex("FFF6A8"), Outline = 2, Size = UDim2.new(1, 0, 0, 22), Position = UDim2.fromOffset(0, 46) })
local luckBanner = UI.box(root, { Size = UDim2.fromOffset(300, 34), Position = UDim2.new(0.5, 0, 0, 96), AnchorPoint = Vector2.new(0.5, 0), Color = Color3.fromHex("7EE0B8"), Stroke = 2.5 })
local luckLbl = UI.text(luckBanner, { Text = "", TextSize = 18, Color = UI.WHITE, Outline = 2 })
luckBanner.Parent.Visible = false

-- notifications
local toastHolder = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(560, 300), Position = UDim2.new(0.5, 0, 0, 140), AnchorPoint = Vector2.new(0.5, 0), Parent = root })
UI.new("UIListLayout", { Padding = UDim.new(0, 6), HorizontalAlignment = Enum.HorizontalAlignment.Center, SortOrder = Enum.SortOrder.LayoutOrder, Parent = toastHolder })
local toastN = 0
local function toast(text: string, color: string?)
	toastN += 1
	local f = UI.box(toastHolder, { Size = UDim2.fromOffset(540, 40), Color = if color then Color3.fromHex(color) else UI.PURPLE, Stroke = 2.5, Radius = 14 })
	f.Parent.LayoutOrder = toastN
	UI.text(f, { Text = text, TextSize = 20, Color = UI.WHITE, Outline = 2, Size = UDim2.new(1, -16, 1, 0), Position = UDim2.fromOffset(8, 0), Wrap = true })
	task.delay(3.2, function()
		f.Parent:Destroy()
	end)
end

-- grosse annonce (œufs mythiques, vols, rebirths)
local function announce(text: string, color: string)
	local f = UI.box(root, { Size = UDim2.fromOffset(700, 64), Position = UDim2.new(0.5, 0, 0.3, 0), AnchorPoint = Vector2.new(0.5, 0.5), Color = Color3.fromHex(color) })
	local holder = f.Parent :: Frame
	UI.text(f, { Text = text, TextSize = 28, Color = UI.WHITE, Outline = 3, Size = UDim2.new(1, -20, 1, 0), Position = UDim2.fromOffset(10, 0), Wrap = true })
	local sc = UI.new("UIScale", { Scale = 0.3, Parent = holder })
	TweenService:Create(sc, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	task.delay(3, function()
		TweenService:Create(sc, TweenInfo.new(0.25), { Scale = 0 }):Play()
		task.wait(0.3)
		holder:Destroy()
	end)
end

-- écran rouge quand on te vole
local alarmFlash = UI.new("Frame", { BackgroundColor3 = Color3.fromHex("FF2A4A"), BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 50, Parent = gui })

---------------------------------------------------------------------------
-- Panneaux
---------------------------------------------------------------------------
local panel: Frame? = nil
local function closePanel()
	if panel then
		(panel.Parent :: Instance):Destroy()
		panel = nil
		play("close")
	end
end
local function openPanel(title: string, color: Color3, h: number?): Frame
	if panel then
		(panel.Parent :: Instance):Destroy()
	end
	play("open")
	local f = UI.box(root, { Size = UDim2.fromOffset(640, h or 470), Position = UDim2.fromScale(0.5, 0.52), AnchorPoint = Vector2.new(0.5, 0.5), ZIndex = 10 })
	local bar = UI.new("Frame", { BackgroundColor3 = color, Size = UDim2.new(1, 0, 0, 58), ZIndex = 3, Parent = f })
	UI.corner(bar, 18)
	UI.text(bar, { Text = title, TextSize = 32, Color = UI.WHITE, Outline = 3, ZIndex = 4 })
	UI.button(f, { Text = "X", Color = UI.RED, Size = UDim2.fromOffset(46, 46), Position = UDim2.new(1, -54, 0, 6), TextSize = 26, ZIndex = 5 }, closePanel)
	local sc = UI.new("UIScale", { Scale = 0.6, Parent = f.Parent })
	TweenService:Create(sc, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	panel = f
	return f
end
local function scroller(parent: Instance, top: number): ScrollingFrame
	local sc = UI.new("ScrollingFrame", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -24, 1, -(top + 12)),
		Position = UDim2.fromOffset(12, top),
		ScrollBarThickness = 8,
		ScrollBarImageColor3 = UI.INK,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		ZIndex = 3,
		Parent = parent,
	})
	return sc
end

local function shopPanel()
	local f = openPanel("🛒 Boutique Robux", Color3.fromHex("FF8FB8"), 520)
	local sc = scroller(f, 68)
	UI.new("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder, Parent = sc })
	local n = 0
	local function row(icon: string, name: string, desc: string, robux: number, owned: boolean, buy: () -> ())
		n += 1
		local r = UI.new("Frame", { BackgroundColor3 = UI.WHITE, Size = UDim2.new(1, -12, 0, 70), LayoutOrder = n, ZIndex = 3, Parent = sc })
		UI.corner(r, 14)
		UI.stroke(r, 2.5)
		UI.text(r, { Text = icon, TextSize = 36, Size = UDim2.fromOffset(60, 70), ZIndex = 4 })
		UI.text(r, { Text = name, TextSize = 22, AlignX = Enum.TextXAlignment.Left, Size = UDim2.new(1, -230, 0, 32), Position = UDim2.fromOffset(62, 6), ZIndex = 4 })
		UI.text(r, { Text = desc, TextSize = 16, Color = UI.MUTED, AlignX = Enum.TextXAlignment.Left, Size = UDim2.new(1, -230, 0, 28), Position = UDim2.fromOffset(62, 36), Wrap = true, ZIndex = 4 })
		local b = UI.button(r, { Text = if owned then "✔ Acquis" else "R$ " .. robux, Color = if owned then UI.MINT else UI.GREEN, Size = UDim2.fromOffset(140, 46), Position = UDim2.new(1, -152, 0, 12), TextSize = 20, ZIndex = 5 }, buy)
		if owned then
			b:set(nil, false)
		end
	end
	UI.text(sc, { Text = "Passes (pour toujours)", TextSize = 22, Size = UDim2.new(1, 0, 0, 30), ZIndex = 4 }).LayoutOrder = 0
	for _, p in Config.Passes do
		row(p.icon, p.name, p.desc, p.robux, S and S.passes[p.key] == true, function()
			if p.id == 0 then
				toast("Ce pass n'est pas encore en vente.", "FF5A6E")
				return
			end
			MarketplaceService:PromptGamePassPurchase(player, p.id)
		end)
	end
	n += 1
	UI.text(sc, { Text = "Objets", TextSize = 22, Size = UDim2.new(1, 0, 0, 30), ZIndex = 4 }).LayoutOrder = n
	for _, p in Config.Products do
		row(p.icon, p.name, p.desc, p.robux, false, function()
			if p.id == 0 then
				toast("Cet objet n'est pas encore en vente.", "FF5A6E")
				return
			end
			MarketplaceService:PromptProductPurchase(player, p.id)
		end)
	end
end

local function rebirthPanel()
	local f = openPanel("🌟 Rebirth", Color3.fromHex("B69CFF"), 400)
	local r = if S then S.rebirths else 0
	local cost = Config.rebirthCost(r)
	UI.text(f, { Text = "Rebirths : " .. r .. "   ·   Argent x" .. Config.rebirthMult(r), TextSize = 24, Size = UDim2.new(1, 0, 0, 34), Position = UDim2.fromOffset(0, 74) })
	UI.text(f, { Text = "Renais pour gagner <b>x" .. Config.rebirthMult(r + 1) .. "</b> d'argent pour toujours et +5 s de verrou.\nTon argent et ta base repartent de zéro.", Rich = true, Wrap = true, TextSize = 20, Color = UI.MUTED, Size = UDim2.new(1, -60, 0, 80), Position = UDim2.fromOffset(30, 116) })
	local cash = if S then S.cash else 0
	local _, setBar = UI.bar(f, { Size = UDim2.new(1, -80, 0, 28), Position = UDim2.fromOffset(40, 210), Color = UI.LILAC, Value = cash / cost })
	setBar(cash / cost)
	UI.text(f, { Text = "$" .. fmt(cash) .. " / $" .. fmt(cost), TextSize = 20, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 242) })
	local b = UI.button(f, { Text = "RENAÎTRE", Color = UI.PURPLE, Size = UDim2.fromOffset(260, 64), Position = UDim2.new(0.5, -130, 0, 300), TextSize = 30 }, function()
		send("rebirth")
		closePanel()
	end)
	b:set(nil, cash >= cost)
end

local function basePanel()
	local f = openPanel("🏠 Ma base", Color3.fromHex("7FD6FF"), 400)
	local lvl = if S then S.level else 1
	local slots = Config.SLOT_LEVELS[lvl]
	UI.text(f, { Text = "Socles : " .. slots .. " / 20", TextSize = 26, Size = UDim2.new(1, 0, 0, 34), Position = UDim2.fromOffset(0, 76) })
	local cost = Config.EXPAND_COST[lvl]
	if cost then
		UI.text(f, { Text = "Agrandir : +5 socles pour $" .. fmt(cost), TextSize = 20, Color = UI.MUTED, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 118) })
		local b = UI.button(f, { Text = "AGRANDIR", Color = UI.GREEN, Size = UDim2.fromOffset(240, 56), Position = UDim2.new(0.5, -120, 0, 156), TextSize = 26 }, function()
			send("expand")
			closePanel()
		end)
		b:set(nil, S and S.cash >= cost)
	else
		UI.text(f, { Text = "Ta base est au maximum !", TextSize = 20, Color = UI.MUTED, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 130) })
	end
	UI.button(f, { Text = "Retour à ma base", Color = UI.SKY, Size = UDim2.fromOffset(240, 52), Position = UDim2.new(0.5, -120, 0, 232), TextSize = 22 }, function()
		send("home")
		closePanel()
	end)
	UI.text(f, { Text = "Pets volés : " .. (if S then S.stolen else 0), TextSize = 18, Color = UI.MUTED, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 300) })
	UI.text(f, { Text = "Astuce : marche sur le bouton rouge au fond de ta base pour la verrouiller.", TextSize = 16, Color = UI.MUTED, Wrap = true, Size = UDim2.new(1, -40, 0, 40), Position = UDim2.fromOffset(20, 336) })
end

local function indexPanel()
	local f = openPanel("📖 Index des pets", Color3.fromHex("FFB020"), 540)
	local found: { [string]: boolean } = {}
	for _, id in (if S then S.index else {}) do
		found[id] = true
	end
	local count = 0
	for _ in found do
		count += 1
	end
	UI.text(f, { Text = count .. " / " .. #Config.PetOrder .. " découverts", TextSize = 20, Color = UI.MUTED, Size = UDim2.new(1, 0, 0, 26), Position = UDim2.fromOffset(0, 62) })
	local sc = scroller(f, 92)
	UI.new("UIGridLayout", { CellSize = UDim2.fromOffset(112, 140), CellPadding = UDim2.fromOffset(8, 8), SortOrder = Enum.SortOrder.LayoutOrder, Parent = sc })
	local order = table.clone(Config.PetOrder)
	table.sort(order, function(a, b)
		local pa, pb = Config.Pets[a], Config.Pets[b]
		if pa.rarity ~= pb.rarity then
			return pa.rarity < pb.rarity
		end
		return pa.income < pb.income
	end)
	for i, id in order do
		local def = Config.Pets[id]
		local have = found[id] == true
		local rc = Config.Rarities[def.rarity]
		local card = UI.new("Frame", { BackgroundColor3 = if have then rc.color:Lerp(Color3.new(1, 1, 1), 0.7) else UI.GRAY, LayoutOrder = i, ZIndex = 3, Parent = sc })
		UI.corner(card, 12)
		UI.stroke(card, 2.5, if have then rc.color else UI.MUTED)
		UI.viewport(card, PetModels.build(id, 0, false, 1, not have, THUMB), { Size = UDim2.new(1, 0, 0, 92) })
		UI.text(card, { Text = if have then def.name else "???", TextSize = 13, Wrap = true, Size = UDim2.new(1, -6, 0, 28), Position = UDim2.fromOffset(3, 90), ZIndex = 4 })
		UI.text(card, { Text = if have then "$" .. fmt(def.income) .. "/s" else rc.name, TextSize = 13, Color = if have then Color3.fromHex("2DBE78") else rc.color, Size = UDim2.new(1, 0, 0, 18), Position = UDim2.fromOffset(0, 118), ZIndex = 4 })
	end
end

local function helpPanel()
	local f = openPanel("❓ Comment jouer", UI.ORANGE, 470)
	local lines = {
		"🥚 Achète des œufs sur le <b>tapis rouge</b> (touche E).",
		"⏱ Ils éclosent dans ta base : plus l'œuf est rare, plus le pet rapporte.",
		"💵 Marche sur la <b>plaque verte</b> devant un pet pour ramasser son argent.",
		"😈 Entre chez les autres et maintiens E sur un pet pour le <b>voler</b>, puis ramène-le chez toi.",
		"🍭 Frappe les voleurs avec ta <b>batte</b> : ils lâchent ce qu'ils portent.",
		"🔒 Le bouton rouge au fond de ta base la <b>verrouille</b> quelques secondes.",
		"🌟 Fais un <b>rebirth</b> pour gagner plus d'argent pour toujours.",
	}
	for i, l in lines do
		UI.text(f, { Text = l, Rich = true, Wrap = true, TextSize = 19, AlignX = Enum.TextXAlignment.Left, Size = UDim2.new(1, -50, 0, 52), Position = UDim2.fromOffset(25, 66 + (i - 1) * 56) })
	end
end

-- boutons à gauche
local leftBar = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(130, 480), Position = UDim2.new(0, 14, 0.5, 0), AnchorPoint = Vector2.new(0, 0.5), Parent = root })
UI.new("UIListLayout", { Padding = UDim.new(0, 10), Parent = leftBar })
local function sideButton(text: string, color: Color3, fn: () -> ())
	local holder = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(124, 54), Parent = leftBar })
	UI.button(holder, { Text = text, Color = color, Size = UDim2.fromScale(1, 1), TextSize = 19 }, fn)
end
sideButton("🛒 Boutique", Color3.fromHex("FF8FB8"), shopPanel)
sideButton("🌟 Rebirth", UI.PURPLE, rebirthPanel)
sideButton("🏠 Base", UI.SKY, basePanel)
sideButton("📖 Index", Color3.fromHex("FFB020"), indexPanel)
sideButton("❓ Aide", UI.ORANGE, helpPanel)
sideButton("🔊 Son", UI.MUTED, function()
	muted = not muted
	music.Volume = if muted then 0 else Config.Music.volume
end)
local collectAll = UI.button(root, { Text = "💰 Tout ramasser", Color = UI.GREEN, Size = UDim2.fromOffset(200, 54), Position = UDim2.new(1, -214, 1, -150), TextSize = 20 }, function()
	send("collectAll")
end)
collectAll.holder.Visible = false

-- carte de l'éclosion
local function hatchCard(def: string, tier: number, shiny: boolean, isNew: boolean)
	local p = Config.Pets[def]
	local rc = Config.Rarities[p.rarity]
	local f = UI.box(root, { Size = UDim2.fromOffset(300, 300), Position = UDim2.new(0.5, 0, 0.55, 0), AnchorPoint = Vector2.new(0.5, 0.5), Color = rc.color:Lerp(Color3.new(1, 1, 1), 0.6), ZIndex = 20 })
	local holder = f.Parent :: Frame
	UI.viewport(f, PetModels.build(def, tier, shiny, 1, false, THUMB * 2), { Size = UDim2.new(1, 0, 0, 180), Position = UDim2.fromOffset(0, 10) })
	local tierName = Config.TierNames[tier]
	local title = (if shiny then "✨ " else "") .. (if tierName ~= "" then tierName .. " " else "") .. p.name
	UI.text(f, { Text = title, TextSize = 24, Wrap = true, Size = UDim2.new(1, -16, 0, 50), Position = UDim2.fromOffset(8, 186) })
	UI.text(f, { Text = rc.name .. (if isNew then " · NOUVEAU !" else ""), TextSize = 20, Color = rc.color, Outline = 2, Size = UDim2.new(1, 0, 0, 26), Position = UDim2.fromOffset(0, 232) })
	UI.text(f, { Text = "+$" .. fmt(Config.petIncome(def, tier, shiny) * (if S then S.mult else 1)) .. "/s", TextSize = 22, Color = Color3.fromHex("2DBE78"), Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 260) })
	local sc = UI.new("UIScale", { Scale = 0.2, Parent = holder })
	TweenService:Create(sc, TweenInfo.new(0.4, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	play("crack")
	task.delay(0.15, function()
		play(if p.rarity >= Config.DIVINE then "divine" elseif p.rarity >= Config.MYTHIC then "legend" elseif p.rarity >= Config.EPIC then "reveal_rare" else "reveal")
	end)
	task.delay(2.6, function()
		TweenService:Create(sc, TweenInfo.new(0.25), { Scale = 0 }):Play()
		task.wait(0.3)
		holder:Destroy()
	end)
end

---------------------------------------------------------------------------
-- État envoyé par le serveur
---------------------------------------------------------------------------
StateEvent.OnClientEvent:Connect(function(state)
	S = state
	cashLbl.Text = "$" .. fmt(state.cash)
	incomeLbl.Text = "+$" .. fmt(state.income) .. "/s"
	collectAll.holder.Visible = state.passes.vip == true
end)

---------------------------------------------------------------------------
-- Effets
---------------------------------------------------------------------------
local function floatText(pos: Vector3, text: string, color: Color3)
	local a = UI.new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, Transparency = 1, Size = Vector3.one * 0.2, Position = pos, Parent = workspace })
	local bb = UI.new("BillboardGui", { Size = UDim2.fromOffset(200, 50), AlwaysOnTop = true, LightInfluence = 0, Parent = a })
	local t = UI.text(bb, { Text = text, TextSize = 34, Color = color, Outline = 3 })
	TweenService:Create(a, TweenInfo.new(1.2, Enum.EasingStyle.Quad), { Position = pos + Vector3.new(0, 7, 0) }):Play()
	TweenService:Create(t, TweenInfo.new(1.2), { TextTransparency = 1 }):Play()
	Debris:AddItem(a, 1.3)
end

local function burst(pos: Vector3, color: Color3, n: number)
	for _ = 1, n do
		local p = UI.new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, Size = Vector3.one * 0.6, Shape = Enum.PartType.Ball, Material = Enum.Material.Neon, Color = color:Lerp(Color3.new(1, 1, 1), math.random() * 0.5), Position = pos, Parent = workspace })
		local dir = Vector3.new(math.random() - 0.5, math.random() * 0.8 + 0.2, math.random() - 0.5).Unit * (4 + math.random() * 6)
		TweenService:Create(p, TweenInfo.new(0.7, Enum.EasingStyle.Quad), { Position = pos + dir, Transparency = 1, Size = Vector3.one * 0.1 }):Play()
		Debris:AddItem(p, 0.8)
	end
end

Fx.OnClientEvent:Connect(function(kind: string, a: any)
	if kind == "toast" then
		toast(a.text, a.color)
	elseif kind == "announce" then
		announce(a.text, a.color)
		if a.rarity >= 6 then
			play("legend")
		else
			play("quest")
		end
	elseif kind == "error" then
		play("error")
	elseif kind == "bought" then
		play("buy")
	elseif kind == "sold" then
		play("buy")
		toast("Vendu pour $" .. fmt(a.amount), "3DD68C")
	elseif kind == "collect" then
		play("coin")
		if a.pos then
			floatText(a.pos, "+$" .. fmt(a.amount), Color3.fromHex("7CFF9E"))
		else
			toast("+$" .. fmt(a.amount) .. " ramassés !", "3DD68C")
		end
	elseif kind == "hatched" then
		hatchCard(a.def, a.tier, a.shiny, a.new)
	elseif kind == "hatchFx" then
		burst(a.pos, Config.Rarities[a.rarity].color, 10 + a.rarity * 4)
	elseif kind == "alarm" then
		play("alarm")
		announce(a.text, "FF2A4A")
		alarmFlash.BackgroundTransparency = 0.55
		TweenService:Create(alarmFlash, TweenInfo.new(1), { BackgroundTransparency = 1 }):Play()
	elseif kind == "stealStart" then
		play("pop")
	elseif kind == "stealOk" then
		play("legend")
		announce(a.text, "3DD68C")
	elseif kind == "locked" then
		play("quest")
		toast("🔒 Ta base est verrouillée !", "FF5A6E")
	elseif kind == "swing" then
		play("swing", 1.2)
	elseif kind == "bonk" then
		play("bonk", 0.8)
		burst(a.pos + Vector3.new(0, 2, 0), Color3.fromHex("FFD54A"), 8)
	elseif kind == "knock" then
		local char = player.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hrp and hum then
			hum:ChangeState(Enum.HumanoidStateType.FallingDown)
			hrp.AssemblyLinearVelocity = a.vel
			task.delay(1, function()
				if hum.Parent then
					hum:ChangeState(Enum.HumanoidStateType.GettingUp)
				end
			end)
		end
	elseif kind == "rebirth" then
		play("divine")
		announce("REBIRTH " .. a.n .. " ! Argent x" .. a.mult, "B69CFF")
	end
end)

---------------------------------------------------------------------------
-- Modèles 3D des socles (dessinés ici, à partir des attributs du serveur)
---------------------------------------------------------------------------
local visFolder = UI.new("Folder", { Name = "PlotVisuals", Parent = workspace })

type Vis = { sig: string, model: Model?, anim: any, base: CFrame, bb: BillboardGui?, top: TextLabel?, mid: TextLabel?, low: TextLabel?, phase: number }
local vis: { [BasePart]: Vis } = {}
local pedestals: { BasePart } = {}
for _, d in plotFolder:GetDescendants() do
	if d:IsA("BasePart") and d.Name == "Pedestal" then
		table.insert(pedestals, d)
	end
end

local function pedSig(ped: BasePart): string
	return string.format("%s|%s|%d|%d|%s|%s|%s", tostring(ped:GetAttribute("Kind")), tostring(ped:GetAttribute("Def")), (ped:GetAttribute("Tier") :: number?) or 0, (ped:GetAttribute("Rarity") :: number?) or 0, tostring(ped:GetAttribute("Shiny")), tostring(ped:GetAttribute("Stolen")), tostring(ped:GetAttribute("Open")))
end

local function rebuild(ped: BasePart, v: Vis)
	if v.model then
		v.model:Destroy()
		v.model = nil
	end
	if v.bb then
		v.bb:Destroy()
		v.bb = nil
	end
	v.anim = nil
	local kind = ped:GetAttribute("Kind")
	if kind == "" or ped:GetAttribute("Stolen") == true then
		return
	end
	local topY = ped.Position.Y + ped.Size.Y / 2
	local face = CFrame.lookAt(ped.Position, Vector3.new(0, ped.Position.Y, ped.Position.Z)).Rotation
	local rarity = (ped:GetAttribute("Rarity") :: number?) or 1
	local rc = Config.Rarities[rarity]
	local bb = UI.new("BillboardGui", { Size = UDim2.fromOffset(190, 78), StudsOffsetWorldSpace = Vector3.new(0, 9, 0), LightInfluence = 0, MaxDistance = 90, Adornee = ped, Parent = visFolder })
	v.bb = bb
	if kind == "pet" then
		local def = ped:GetAttribute("Def") :: string
		local tier = (ped:GetAttribute("Tier") :: number?) or 0
		local shiny = ped:GetAttribute("Shiny") == true
		local p = Config.Pets[def]
		if not p then
			return
		end
		local s = p.scale * PET_SIZE
		local m = PetModels.build(def, tier, shiny, s, false, nil, true)
		v.base = CFrame.new(ped.Position.X, topY + 1.1 * s, ped.Position.Z) * face
		m:PivotTo(v.base)
		m.Parent = visFolder
		v.model = m
		v.anim = PetModels.animator(m)
		local tierName = Config.TierNames[tier]
		v.top = UI.text(bb, { Text = (if shiny then "✨" else "") .. (if tierName ~= "" then tierName .. " " else "") .. p.name, TextSize = 18, Color = if tier == 1 then UI.YELLOW elseif tier == 2 then Color3.fromHex("FF9AE6") else UI.WHITE, Outline = 2, Size = UDim2.new(1, 0, 0, 22) })
		v.mid = UI.text(bb, { Text = rc.name .. " · +$" .. fmt((ped:GetAttribute("Income") :: number?) or 0) .. "/s", TextSize = 15, Color = rc.color, Outline = 2, Size = UDim2.new(1, 0, 0, 20), Position = UDim2.fromOffset(0, 24) })
		v.low = UI.text(bb, { Text = "$0", TextSize = 22, Color = Color3.fromHex("7CFF9E"), Outline = 2, Size = UDim2.new(1, 0, 0, 28), Position = UDim2.fromOffset(0, 46) })
	else
		local m = PetModels.egg("r" .. rarity, 1.2)
		v.base = CFrame.new(ped.Position.X, topY + 2.4, ped.Position.Z) * face
		m:PivotTo(v.base)
		if rarity >= 5 then
			for _, d in m:GetDescendants() do
				if d:IsA("BasePart") and d.Name ~= "Root" then
					d.Material = Enum.Material.Neon
				end
			end
		end
		m.Parent = visFolder
		v.model = m
		v.top = UI.text(bb, { Text = Config.eggOf(rarity).name, TextSize = 18, Color = UI.WHITE, Outline = 2, Size = UDim2.new(1, 0, 0, 22) })
		v.mid = UI.text(bb, { Text = rc.name, TextSize = 15, Color = rc.color, Outline = 2, Size = UDim2.new(1, 0, 0, 20), Position = UDim2.fromOffset(0, 24) })
		v.low = UI.text(bb, { Text = "", TextSize = 22, Color = UI.YELLOW, Outline = 2, Size = UDim2.new(1, 0, 0, 28), Position = UDim2.fromOffset(0, 46) })
	end
end

-- pets portés au-dessus de la tête des voleurs
local carried: { [Player]: { sig: string, model: Model, anim: any } } = {}
local function updateCarried(t: number, dt: number)
	for _, plr in Players:GetPlayers() do
		local char = plr.Character
		local sig = char and char:GetAttribute("Carry") :: string?
		local head = char and char:FindFirstChild("Head") :: BasePart?
		local cur = carried[plr]
		if cur and (not sig or cur.sig ~= sig or not head) then
			cur.model:Destroy()
			carried[plr] = nil
			cur = nil
		end
		if sig and head and not cur then
			local parts = string.split(sig, ":")
			local m: Model
			if parts[1] == "pet" and Config.Pets[parts[2]] then
				m = PetModels.build(parts[2], tonumber(parts[3]) or 0, parts[4] == "1", Config.Pets[parts[2]].scale * 1.1, false, nil, true)
			else
				m = PetModels.egg("r" .. (tonumber(parts[2]) or 1), 0.9)
			end
			m.Parent = visFolder
			cur = { sig = sig, model = m, anim = PetModels.animator(m) }
			carried[plr] = cur
		end
		if cur and head then
			local pivot = CFrame.new(head.Position + Vector3.new(0, 3.2 + math.sin(t * 6) * 0.25, 0)) * head.CFrame.Rotation
			if cur.anim then
				PetModels.pose(cur.anim, pivot, "move", t, dt)
			else
				cur.model:PivotTo(pivot)
			end
		end
	end
end
Players.PlayerRemoving:Connect(function(plr)
	local cur = carried[plr]
	if cur then
		cur.model:Destroy()
		carried[plr] = nil
	end
end)

---------------------------------------------------------------------------
-- Invites (voler / vendre) : chacun ne voit que celles qui le concernent
---------------------------------------------------------------------------
local function refreshPrompts()
	local me = player.UserId
	local tNow = workspace:GetServerTimeNow()
	for _, ped in pedestals do
		local kind = ped:GetAttribute("Kind")
		local owner = ped:GetAttribute("Owner")
		local stolen = ped:GetAttribute("Stolen") == true
		local plot = ped.Parent :: Instance
		local locked = ((plot:GetAttribute("LockUntil") :: number?) or 0) > tNow
		for _, pr in ped:GetChildren() do
			if pr:IsA("ProximityPrompt") then
				local k = pr:GetAttribute("Kind")
				if k == "steal" then
					pr.Enabled = kind ~= "" and owner ~= me and owner ~= 0 and not stolen and not locked
				elseif k == "sell" then
					pr.Enabled = kind == "pet" and owner == me and not stolen
				end
			end
		end
	end
end

---------------------------------------------------------------------------
-- Batte : petite animation de coup
---------------------------------------------------------------------------
local function hookTool(tool: Instance)
	if not tool:IsA("Tool") or tool.Name ~= "Batte" then
		return
	end
	local busy = false
	tool.Activated:Connect(function()
		if busy then
			return
		end
		busy = true
		local g = tool.Grip
		tool.Grip = g * CFrame.Angles(math.rad(-80), 0, 0)
		task.wait(0.12)
		tool.Grip = g * CFrame.Angles(math.rad(40), 0, 0)
		task.wait(0.12)
		tool.Grip = g
		busy = false
	end)
end
local function hookChar(char: Model)
	char.ChildAdded:Connect(hookTool)
	for _, c in char:GetChildren() do
		hookTool(c)
	end
end
player.CharacterAdded:Connect(hookChar)
if player.Character then
	hookChar(player.Character)
end

---------------------------------------------------------------------------
-- Boucle d'affichage
---------------------------------------------------------------------------
local acc = 0
RunService.RenderStepped:Connect(function(dt)
	local t = os.clock()
	local tNow = workspace:GetServerTimeNow()
	local cam = workspace.CurrentCamera
	local camPos = if cam then cam.CFrame.Position else Vector3.zero
	acc += dt
	local slow = acc >= 0.25
	if slow then
		acc = 0
		refreshPrompts()
		local lu = (workspace:GetAttribute("LuckUntil") :: number?) or 0
		luckBanner.Parent.Visible = lu > tNow
		if lu > tNow then
			luckLbl.Text = "🌈 Œufs rares x3 · " .. Config.fmtTime(lu - tNow)
		end
	end
	for i, ped in pedestals do
		local v = vis[ped]
		if not v then
			v = { sig = "", model = nil, anim = nil, base = CFrame.identity, phase = i * 0.7 }
			vis[ped] = v
		end
		local sig = pedSig(ped)
		if sig ~= v.sig then
			v.sig = sig
			rebuild(ped, v)
		end
		local m = v.model
		if not m then
			continue
		end
		local near = (ped.Position - camPos).Magnitude < 160
		if slow and v.low then
			if ped:GetAttribute("Kind") == "pet" then
				v.low.Text = "$" .. fmt((ped:GetAttribute("Cash") :: number?) or 0)
			else
				local left = ((ped:GetAttribute("HatchEnd") :: number?) or 0) - tNow
				v.low.Text = if left > 0 then "⏱ " .. Config.fmtTime(left) else "Éclosion..."
			end
		end
		if near then
			if v.anim then
				PetModels.pose(v.anim, v.base * CFrame.new(0, math.sin(t * 2 + v.phase) * 0.2, 0), "idle", t + v.phase, dt)
			elseif ped:GetAttribute("Kind") == "egg" then
				-- l'œuf tremble de plus en plus avant d'éclore
				local left = ((ped:GetAttribute("HatchEnd") :: number?) or 0) - tNow
				local shake = if left < 5 then (5 - math.max(left, 0)) * 0.04 else 0.01
				m:PivotTo(v.base * CFrame.Angles(0, t * 0.6, math.sin(t * 25) * shake))
			end
		end
	end
	updateCarried(t, dt)
end)
