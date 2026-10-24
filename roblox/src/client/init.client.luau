-- Sweet Pets Factory : côté joueur
-- Interface, animation d'éclosion, affichage des pets de tous les joueurs,
-- effets (dégâts, pièces, confettis) et sons. Le joueur n'envoie que des
-- demandes au serveur, qui reste seul juge.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local MarketplaceService = game:GetService("MarketplaceService")
local SoundService = game:GetService("SoundService")
local Debris = game:GetService("Debris")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local PetModels = require(Shared:WaitForChild("PetModels"))
local THUMB = 120 -- pièces max par vignette 3D de l'interface
local UI = require(script:WaitForChild("UI"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local Action = Remotes:WaitForChild("Action") :: RemoteEvent
local StateEvent = Remotes:WaitForChild("State") :: RemoteEvent
local Fx = Remotes:WaitForChild("Fx") :: RemoteEvent

local S: any = nil -- dernier état reçu du serveur
local muted = false
local fmt = Config.fmt

local function send(name: string, arg: any?)
	Action:FireServer(name, arg)
end

---------------------------------------------------------------------------
-- Sons
-- Les vrais sons du jeu sont dans dist/SweetPets_Sons (click.ogg, coin.ogg…).
-- Importe-les dans Studio et range-les dans SoundService › SweetSounds (voir le
-- README) : chaque Sound est trouvé par son nom. En attendant, les sons
-- intégrés à Roblox servent de remplaçants, et le clic des boutons reste muet.
---------------------------------------------------------------------------
local SOUNDS = {
	-- nom = { volume, son de remplacement, vitesse du remplaçant }
	click = { 0.35 },
	open = { 0.3 },
	close = { 0.25 },
	error = { 0.4 },
	tap = { 0.4 },
	coin = { 0.3, "rbxasset://sounds/electronicpingshort.wav", 2.2 },
	["break"] = { 0.5, "rbxasset://sounds/swoosh.wav", 1.4 },
	pop = { 0.45, "rbxasset://sounds/swoosh.wav", 1.4 },
	buy = { 0.5, "rbxasset://sounds/electronicpingshort.wav", 1.1 },
	quest = { 0.5, "rbxasset://sounds/electronicpingshort.wav", 1.3 },
	hatch = { 0.6, "rbxasset://sounds/swoosh.wav", 0.8 },
	reveal = { 0.5, "rbxasset://sounds/electronicpingshort.wav", 0.9 },
	reveal_rare = { 0.55, "rbxasset://sounds/electronicpingshort.wav", 0.8 },
	legend = { 0.7, "rbxasset://sounds/electronicpingshort.wav", 0.6 },
	divine = { 0.85, "rbxasset://sounds/electronicpingshort.wav", 0.5 },
}
local soundObjs: { [string]: Sound | false } = {}
local function soundFor(name: string): Sound?
	local cached = soundObjs[name]
	if cached then
		return cached
	end
	local info = SOUNDS[name]
	if not info then
		return nil
	end
	local folder = SoundService:FindFirstChild("SweetSounds")
	local custom = folder and folder:FindFirstChild(name)
	if custom and custom:IsA("Sound") and custom.SoundId ~= "" then
		local snd = UI.new("Sound", { SoundId = custom.SoundId, Volume = info[1] * (custom.Volume / 0.5), Parent = SoundService })
		soundObjs[name] = snd
		return snd
	end
	if cached == false then
		return nil
	end
	if info[2] then
		-- remplaçant (sera réévalué si le vrai son est ajouté pendant la partie)
		local snd = UI.new("Sound", { SoundId = info[2], PlaybackSpeed = info[3], Volume = info[1] * 0.6, Parent = SoundService })
		task.delay(10, function()
			if soundObjs[name] == snd then
				soundObjs[name] = nil
			end
		end)
		soundObjs[name] = snd
		return snd
	end
	soundObjs[name] = false
	task.delay(10, function()
		if soundObjs[name] == false then
			soundObjs[name] = nil
		end
	end)
	return nil
end
local lastSound: { [string]: number } = {}
local coinStreak = 0
local function play(name: string)
	if muted then
		return
	end
	local now = os.clock()
	local last = lastSound[name] or 0
	if now - last < 0.06 then
		return
	end
	lastSound[name] = now
	local snd = soundFor(name)
	if snd then
		if name == "coin" then
			-- pièces ramassées à la suite : le son monte d'un demi-ton à chaque fois (une octave max)
			coinStreak = if now - last < 1.2 then math.min(coinStreak + 1, 12) else 0
			snd.PlaybackSpeed = 2 ^ (coinStreak / 12) * (if snd.SoundId:find("rbxasset://") then 2.2 else 1)
		end
		SoundService:PlayLocalSound(snd)
	end
end
UI.onClick = function()
	play("click")
end
UI.onError = function()
	play("error")
end

---------------------------------------------------------------------------
-- Racine de l'interface
---------------------------------------------------------------------------
local gui = UI.new("ScreenGui", {
	Name = "SweetPets",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	IgnoreGuiInset = false,
	Parent = player:WaitForChild("PlayerGui"),
})
local uiScale = UI.new("UIScale", { Parent = gui })
local function rescale()
	local cam = workspace.CurrentCamera
	if cam then
		local vs = cam.ViewportSize
		uiScale.Scale = math.clamp(math.min(vs.X / 1280, vs.Y / 720), 0.55, 1.4)
	end
end
rescale()
workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(rescale)
if workspace.CurrentCamera then
	workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)
end

local L = Enum.TextXAlignment.Left
local R = Enum.TextXAlignment.Right

local hud = UI.new("Frame", { Name = "HUD", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 1, Parent = gui })

---------------------------------------------------------------------------
-- Notifications et fenêtres
---------------------------------------------------------------------------
local toastHost = UI.new("Frame", {
	Name = "Toasts",
	BackgroundTransparency = 1,
	Size = UDim2.fromOffset(600, 300),
	Position = UDim2.new(0.5, 0, 0, 140),
	AnchorPoint = Vector2.new(0.5, 0),
	ZIndex = 10,
	Parent = gui,
})
UI.new("UIListLayout", { Padding = UDim.new(0, 8), HorizontalAlignment = Enum.HorizontalAlignment.Center, SortOrder = Enum.SortOrder.LayoutOrder, Parent = toastHost })

local toastN = 0
local function toast(text: string, color: Color3?)
	toastN += 1
	local f = UI.box(toastHost, { Size = UDim2.fromOffset(560, 42), Color = if color then UI.lighten(color, 0.55) else UI.WHITE, Radius = 18 })
	local holder = f.Parent :: Frame
	holder.LayoutOrder = toastN
	UI.text(f, { Text = text, TextSize = 19, Size = UDim2.new(1, -20, 1, 0), Position = UDim2.fromOffset(10, 0), Wrap = true })
	for _, k in toastHost:GetChildren() do
		if k:IsA("Frame") and k.LayoutOrder <= toastN - 4 then
			k:Destroy()
		end
	end
	Debris:AddItem(holder, 3.2)
end

local popupHost = UI.new("Frame", { Name = "Popup", BackgroundColor3 = Color3.fromHex("1B1030"), BackgroundTransparency = 0.45, Size = UDim2.fromScale(1, 1), Visible = false, Active = true, ZIndex = 9, Parent = gui })

local function popup(title: string, body: string, okText: string?, onOk: (() -> ())?, cancel: boolean?)
	popupHost:ClearAllChildren()
	popupHost.Visible = true
	local f = UI.box(popupHost, { Size = UDim2.fromOffset(540, 300), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), Radius = 26 })
	UI.text(f, { Text = title, TextSize = 34, Color = UI.YELLOW, Outline = 3, Size = UDim2.new(1, 0, 0, 60), Position = UDim2.fromOffset(0, 14) })
	UI.text(f, { Text = body, TextSize = 21, Wrap = true, Size = UDim2.new(1, -60, 0, 130), Position = UDim2.fromOffset(30, 76) })
	local function close()
		popupHost.Visible = false
		popupHost:ClearAllChildren()
	end
	local function ok()
		close()
		if onOk then
			onOk()
		end
	end
	if cancel then
		UI.button(f, { Text = "Annuler", Color = UI.RED, Size = UDim2.fromOffset(200, 54), Position = UDim2.new(0.5, -210, 1, -78) }, close)
		UI.button(f, { Text = okText or "OK", Color = UI.GREEN, Size = UDim2.fromOffset(200, 54), Position = UDim2.new(0.5, 10, 1, -78) }, ok)
	else
		UI.button(f, { Text = okText or "OK", Color = UI.GREEN, Size = UDim2.fromOffset(220, 54), Position = UDim2.new(0.5, -110, 1, -78) }, ok)
	end
end

---------------------------------------------------------------------------
-- HUD
---------------------------------------------------------------------------
local function pill(x: number, icon: string): TextLabel
	local f = UI.box(hud, { Size = UDim2.fromOffset(170, 44), Position = UDim2.fromOffset(x, 8), Radius = 22 })
	UI.text(f, { Text = icon, TextSize = 24, Size = UDim2.fromOffset(40, 44), Position = UDim2.fromOffset(4, 0) })
	return UI.text(f, { Text = "0", TextSize = 24, AlignX = L, Size = UDim2.new(1, -52, 1, 0), Position = UDim2.fromOffset(46, 0) })
end
local coinsText = pill(12, "🪙")
local gemsText = pill(192, "💎")

-- bannière du monde
local banner = UI.box(hud, { Size = UDim2.fromOffset(340, 60), Position = UDim2.new(0.5, 0, 0, 4), AnchorPoint = Vector2.new(0.5, 0), Color = UI.YELLOW, Radius = 20 })
local bannerTitle = UI.text(banner, { Text = "Candy Meadow", TextSize = 26, Size = UDim2.new(1, 0, 0, 34), Position = UDim2.fromOffset(0, 4) })
local bannerSub = UI.text(banner, { Text = "", TextSize = 15, Size = UDim2.new(1, 0, 0, 18), Position = UDim2.fromOffset(0, 36) })

-- suivi de quête
local questBox = UI.box(hud, { Size = UDim2.fromOffset(300, 66), Position = UDim2.fromOffset(12, 62), Radius = 18 })
local questTitle = UI.text(questBox, { Text = "", TextSize = 16, AlignX = L, Size = UDim2.new(1, -24, 0, 26), Position = UDim2.fromOffset(12, 4) })
local _, questSet = UI.bar(questBox, { Size = UDim2.new(1, -24, 0, 20), Position = UDim2.fromOffset(12, 34), Color = UI.YELLOW })
local questLbl = UI.text(questBox, { Text = "", TextSize = 13, Size = UDim2.new(1, -24, 0, 20), Position = UDim2.fromOffset(12, 34) })
local questBtn = UI.new("TextButton", { BackgroundTransparency = 1, Text = "", Size = UDim2.fromScale(1, 1), Parent = questBox })

-- minuteurs (haut droite)
-- sous le nom du monde, au centre : la liste des joueurs de Roblox occupe le coin haut droit
local timers = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(940, 40), Position = UDim2.new(0.5, 0, 0, 134), AnchorPoint = Vector2.new(0.5, 0), Parent = hud })
UI.new("UIListLayout", { Padding = UDim.new(0, 8), FillDirection = Enum.FillDirection.Horizontal, HorizontalAlignment = Enum.HorizontalAlignment.Center, SortOrder = Enum.SortOrder.LayoutOrder, Parent = timers })
local timerLabels: { [string]: TextLabel } = {}
local timerChips: { [string]: Frame } = {}
local function timerChip(id: string, icon: string, order: number)
	local f = UI.box(timers, { Size = UDim2.fromOffset(220, 36), Radius = 18 })
	local holder = f.Parent :: Frame
	holder.LayoutOrder = order
	holder.Visible = false
	UI.text(f, { Text = icon, TextSize = 18, Size = UDim2.fromOffset(34, 36), Position = UDim2.fromOffset(4, 0) })
	timerLabels[id] = UI.text(f, { Text = "", TextSize = 17, AlignX = L, Size = UDim2.new(1, -44, 1, 0), Position = UDim2.fromOffset(38, 0) })
	timerChips[id] = holder
end
timerChip("boss", "💀", 0)
timerChip("coins", "🟡", 1)
timerChip("luck", "🍀", 2)
timerChip("dmg", "💪", 3)

-- menus latéraux
local menuBadges: { [string]: TextLabel } = {}
local openPanel: (string) -> ()
local function menuButton(x: UDim, y: number, id: string, icon: string, labelText: string, color: Color3): Frame
	local holder = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(64, 84), Position = UDim2.new(x, UDim.new(0, y)), Parent = hud })
	local b = UI.button(holder, { Color = color, Size = UDim2.fromOffset(64, 64), Text = "", Radius = 18 }, function()
		openPanel(id)
	end)
	UI.text(b.frame, { Text = icon, TextSize = 32 })
	UI.text(holder, { Text = labelText, TextSize = 14, Color = UI.WHITE, Outline = 2.5, Size = UDim2.new(1, 40, 0, 18), Position = UDim2.new(0, -20, 0, 68) })
	local badge = UI.text(b.frame, { Text = "", TextSize = 14, Color = UI.WHITE, Size = UDim2.fromOffset(26, 26), Position = UDim2.new(1, -16, 0, -10) })
	badge.BackgroundTransparency = 0
	badge.BackgroundColor3 = Color3.fromHex("D81E4A")
	UI.corner(badge, 13)
	UI.stroke(badge, 2.5)
	badge.Visible = false
	menuBadges[id] = badge
	return holder
end
menuButton(UDim.new(0, 12), 150, "pets", "🐾", "Pets (P)", UI.PINK)
menuButton(UDim.new(0, 12), 240, "index", "📖", "Index (I)", UI.LILAC)
menuButton(UDim.new(0, 12), 330, "shop", "🛍️", "Boutique (B)", UI.GREEN)
menuButton(UDim.new(0, 12), 420, "quests", "📜", "Quêtes (J)", UI.YELLOW)
menuButton(UDim.new(1, -76), 150, "worlds", "🌍", "Mondes (C)", UI.MINT)
menuButton(UDim.new(1, -76), 240, "gift", "🎁", "Cadeau (G)", UI.ORANGE)
menuButton(UDim.new(1, -76), 330, "rebirth", "🌀", "Rebirth (R)", UI.PURPLE)
menuButton(UDim.new(1, -76), 420, "settings", "⚙️", "Réglages", Color3.fromHex("C9C2E6"))

-- pets équipés (bas gauche)
local eqHolder = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(700, 100), Position = UDim2.new(0, 12, 1, -10), AnchorPoint = Vector2.new(0, 1), Parent = hud })
local eqLabel = UI.text(eqHolder, { Text = "Équipés", TextSize = 16, Color = UI.WHITE, Outline = 2.5, AlignX = L, Size = UDim2.fromOffset(300, 20), Position = UDim2.fromOffset(4, 0) })
local eqBar = UI.box(eqHolder, { Size = UDim2.fromOffset(300, 74), Position = UDim2.fromOffset(0, 24), Radius = 20 })
local eqSig = ""

-- récolte auto (bas droite)
local autoBox = UI.box(hud, { Size = UDim2.fromOffset(250, 54), Position = UDim2.new(1, -12, 1, -12), AnchorPoint = Vector2.new(1, 1), Radius = 20 })
UI.text(autoBox, { Text = "Récolte auto (F)", TextSize = 18, AlignX = L, Size = UDim2.new(1, -90, 1, 0), Position = UDim2.fromOffset(14, 0) })
local autoBtn = UI.button(autoBox, { Text = "OUI", Color = UI.GREEN, Size = UDim2.fromOffset(66, 34), Position = UDim2.new(1, -78, 0, 9), TextSize = 16, Radius = 14 }, function()
	if S then
		send("autoCollect", not S.autoCollect)
	end
end)
local cpsText = UI.text(hud, { Text = "+0/s", TextSize = 22, Color = UI.YELLOW, Outline = 2.5, AlignX = R, Size = UDim2.fromOffset(240, 26), Position = UDim2.new(1, -16, 1, -96), AnchorPoint = Vector2.new(1, 0) })

-- combo, aide, boss, auto-éclosion (centre)
local comboBox = UI.box(hud, { Size = UDim2.fromOffset(210, 46), Position = UDim2.new(0.5, 0, 1, -130), AnchorPoint = Vector2.new(0.5, 0), Color = UI.ORANGE, Radius = 20 })
local comboText = UI.text(comboBox, { Text = "", TextSize = 26, Color = UI.WHITE, Outline = 3 })
local comboHolder = comboBox.Parent :: Frame
comboHolder.Visible = false
local hintBox = UI.box(hud, { Size = UDim2.fromOffset(640, 42), Position = UDim2.new(0.5, 0, 1, -184), AnchorPoint = Vector2.new(0.5, 0), Color = UI.WHITE, Radius = 20 })
local hintText = UI.text(hintBox, { Text = "", TextSize = 18 })
local hintHolder = hintBox.Parent :: Frame
hintHolder.Visible = false

local bossBtn = UI.button(hud, { Text = "COMBATTRE LE GOLEM", Color = UI.RED, Size = UDim2.fromOffset(400, 56), Position = UDim2.new(0.5, -200, 0, 74), TextSize = 22 }, function()
	send("joinBoss")
end)
bossBtn.holder.Visible = false

local bossHud = UI.box(hud, { Size = UDim2.fromOffset(600, 84), Position = UDim2.new(0.5, 0, 0, 4), AnchorPoint = Vector2.new(0.5, 0), Radius = 22 })
UI.text(bossHud, { Text = "GUMMY GOLEM", TextSize = 24, Size = UDim2.new(1, 0, 0, 34), Position = UDim2.fromOffset(0, 2) })
local _, bossHpSet = UI.bar(bossHud, { Size = UDim2.new(1, -40, 0, 28), Position = UDim2.fromOffset(20, 40), Color = UI.RED })
local bossHpText = UI.text(bossHud, { Text = "", TextSize = 15, Size = UDim2.new(1, -40, 0, 28), Position = UDim2.fromOffset(20, 40) })
local bossHudHolder = bossHud.Parent :: Frame
bossHudHolder.Visible = false
local bossTip = UI.box(hud, { Size = UDim2.fromOffset(640, 42), Position = UDim2.new(0.5, 0, 1, -64), AnchorPoint = Vector2.new(0.5, 0), Color = UI.WHITE, Radius = 20 })
UI.text(bossTip, { Text = "Clique le point jaune (x3) · Sors de la zone rouge avant l'impact !", TextSize = 17 })
local bossTipHolder = bossTip.Parent :: Frame
bossTipHolder.Visible = false
local bannerHolder = banner.Parent :: Frame
local questHolder = questBox.Parent :: Frame

local autoHatchBtn = UI.button(hud, { Text = "Auto-éclosion : NON", Color = UI.LILAC, Size = UDim2.fromOffset(280, 52), Position = UDim2.new(0.5, -140, 1, -72), TextSize = 19 }, nil)
autoHatchBtn.holder.Visible = false

---------------------------------------------------------------------------
-- Fenêtres (panneaux)
---------------------------------------------------------------------------
local panelHost = UI.new("Frame", { Name = "Panel", BackgroundColor3 = Color3.fromHex("1B1030"), BackgroundTransparency = 0.5, Size = UDim2.fromScale(1, 1), Visible = false, Active = true, ZIndex = 5, Parent = gui })

type PanelDef = { title: string, color: Color3, w: number, h: number, sig: () -> string, build: (Frame) -> () }
local panels: { [string]: PanelDef } = {}
local onOpen: { [string]: () -> () } = {} -- appelé à l'ouverture d'un panneau
local current = { name = nil :: string?, sig = "", tab = 1, sel = nil :: number?, scroll = Vector2.zero }

local function closePanel()
	if current.name then
		play("close")
	end
	current.name = nil
	panelHost.Visible = false
	panelHost:ClearAllChildren()
end

local function renderPanel()
	local name = current.name
	if not name or not S then
		return
	end
	local def = panels[name]
	-- garde la position de défilement
	local old = panelHost:FindFirstChild("Scroll", true) :: ScrollingFrame?
	if old then
		current.scroll = old.CanvasPosition
	end
	panelHost:ClearAllChildren()
	panelHost.Visible = true
	local f = UI.box(panelHost, { Size = UDim2.fromOffset(def.w, def.h), Position = UDim2.new(0.5, 0, 0.5, 14), AnchorPoint = Vector2.new(0.5, 0.5), Radius = 30 })
	local tw = math.max(220, (utf8.len(def.title) or #def.title) * 18 + 60)
	local tab = UI.box(f, { Size = UDim2.fromOffset(tw, 56), Position = UDim2.new(0.5, 0, 0, -28), AnchorPoint = Vector2.new(0.5, 0), Color = def.color, Radius = 22 })
	UI.text(tab, { Text = def.title, TextSize = 30, Color = UI.WHITE, Outline = 3 })
	UI.button(f, { Text = "✕", Color = UI.RED, Size = UDim2.fromOffset(54, 54), Position = UDim2.new(1, -40, 0, -22), TextSize = 26, Radius = 18 }, closePanel)
	local content = UI.new("Frame", { Name = "Content", BackgroundTransparency = 1, Size = UDim2.new(1, -56, 1, -70), Position = UDim2.fromOffset(28, 46), Parent = f })
	def.build(content)
	local sc = panelHost:FindFirstChild("Scroll", true) :: ScrollingFrame?
	if sc then
		local target = current.scroll
		task.defer(function()
			if sc.Parent then
				sc.CanvasPosition = target
			end
		end)
	end
	current.sig = def.sig()
end

openPanel = function(name: string)
	if not panels[name] or not S then
		return
	end
	if current.name ~= name then
		play("open")
		current.tab = 1
		current.scroll = Vector2.zero
	end
	current.name = name
	local hook = onOpen[name]
	if hook then
		hook()
	end
	renderPanel()
end

local function refreshPanel()
	local name = current.name
	if name and S and panels[name].sig() ~= current.sig then
		renderPanel()
	end
end

local function tabs(parent: Instance, names: { string }, color: Color3)
	local x = 0
	for i, n in names do
		local w = (utf8.len(n) or #n) * 11 + 44
		UI.button(parent, { Text = n, Color = if current.tab == i then color else Color3.fromHex("C9C2E6"), Size = UDim2.fromOffset(w, 40), Position = UDim2.fromOffset(x, 0), TextSize = 18 }, function()
			if current.tab ~= i then
				current.tab = i
				current.scroll = Vector2.zero
				renderPanel()
			end
		end)
		x += w + 12
	end
end

local function scroller(parent: Instance, size: UDim2, pos: UDim2): ScrollingFrame
	return UI.new("ScrollingFrame", {
		Name = "Scroll",
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		Size = size,
		Position = pos,
		ScrollBarThickness = 8,
		ScrollBarImageColor3 = UI.INK,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		Parent = parent,
	})
end

local function sortedPets()
	local list = table.clone(S.pets)
	table.sort(list, function(a, b)
		if a.eq ~= b.eq then
			return a.eq
		end
		if a.power ~= b.power then
			return a.power > b.power
		end
		return a.uid < b.uid
	end)
	return list
end

local function petCell(parent: Instance, p: any, size: number, onClick: () -> (), selected: boolean): TextButton
	local def = Config.Pets[p.def]
	local rc = Config.Rarities[def.rarity].color
	local b = UI.new("TextButton", { Text = "", AutoButtonColor = true, BackgroundColor3 = UI.lighten(def.body, 0.75), Size = UDim2.fromOffset(size, size), Parent = parent })
	UI.corner(b, 16)
	UI.stroke(b, if selected then 6 else 3.5, rc)
	UI.viewport(b, PetModels.build(p.def, p.tier, p.shiny, 1, false, THUMB), {})
	UI.text(b, { Text = "Nv " .. p.lvl, TextSize = 14, Color = UI.WHITE, Outline = 2, AlignX = L, Size = UDim2.fromOffset(60, 18), Position = UDim2.new(0, 6, 1, -20) })
	if p.eq then
		UI.text(b, { Text = "✅", TextSize = 18, Size = UDim2.fromOffset(24, 24), Position = UDim2.fromOffset(4, 4) })
	end
	if p.lock then
		UI.text(b, { Text = "🔒", TextSize = 16, Size = UDim2.fromOffset(24, 24), Position = UDim2.new(1, -26, 0, 4) })
	end
	if p.tier > 0 then
		UI.text(b, { Text = if p.tier == 1 then "⭐" else "🌈", TextSize = 16, Size = UDim2.fromOffset(24, 24), Position = UDim2.new(1, -26, 1, -26) })
	end
	b.Activated:Connect(function()
		play("click")
		onClick()
	end)
	return b
end

-- Mes pets ---------------------------------------------------------------
panels.pets = {
	title = "Mes pets",
	color = UI.PINK,
	w = 1080,
	h = 600,
	sig = function()
		local t = { tostring(current.sel), S.slots, S.storage, S.autoDelete }
		for _, p in S.pets do
			table.insert(t, string.format("%d%s%s%d%d", p.uid, tostring(p.eq), tostring(p.lock), p.tier, p.lvl))
		end
		return table.concat(t, ",")
	end,
	build = function(c)
		local eqCount = 0
		for _, p in S.pets do
			if p.eq then
				eqCount += 1
			end
		end
		UI.text(c, { Text = string.format("Inventaire %d/%d", #S.pets, S.storage), TextSize = 19, AlignX = L, Size = UDim2.fromOffset(280, 22), Position = UDim2.fromOffset(0, 0) })
		UI.text(c, { Text = string.format("Équipés %d/%d", eqCount, S.slots), TextSize = 16, AlignX = L, Size = UDim2.fromOffset(280, 20), Position = UDim2.fromOffset(0, 22) })
		UI.button(c, { Text = "Équiper les meilleurs", Color = UI.GREEN, Size = UDim2.fromOffset(230, 44), Position = UDim2.fromOffset(290, 0), TextSize = 18 }, function()
			send("equipBest")
		end)
		local adNames = { [0] = "Aucune", [1] = "Communs", [2] = "Peu communs", [3] = "Rares" }
		UI.button(c, { Text = "Auto-suppr. : " .. adNames[S.autoDelete], Color = UI.LILAC, Size = UDim2.fromOffset(250, 44), Position = UDim2.fromOffset(532, 0), TextSize = 17 }, function()
			send("autoDelete", (S.autoDelete + 1) % 4)
		end)
		local limit = math.max(Config.UNCOMMON, S.autoDelete)
		local junkN = 0
		for _, p in S.pets do
			if not p.eq and not p.lock and p.tier == 0 and not p.shiny and (p.bonus or 0) == 0 and Config.Pets[p.def].rarity <= limit then
				junkN += 1
			end
		end
		UI.button(c, { Text = "Vider (" .. junkN .. ")", Color = UI.RED, Size = UDim2.fromOffset(230, 44), Position = UDim2.fromOffset(794, 0), TextSize = 18, Enabled = junkN > 0 }, function()
			popup("Vider l'inventaire ?", "Supprimer " .. junkN .. " pets de faible rareté (non équipés, non verrouillés, non fusionnés) ?", "Supprimer", function()
				send("deleteJunk")
			end, true)
		end)

		local grid = scroller(c, UDim2.fromOffset(690, 470), UDim2.fromOffset(0, 60))
		UI.new("UIGridLayout", { CellSize = UDim2.fromOffset(102, 102), CellPadding = UDim2.fromOffset(10, 10), SortOrder = Enum.SortOrder.LayoutOrder, Parent = grid })
		UI.new("UIPadding", { PaddingTop = UDim.new(0, 6), PaddingLeft = UDim.new(0, 6), Parent = grid })
		local selPet = nil
		for i, p in sortedPets() do
			if p.uid == current.sel then
				selPet = p
			end
			local cell = petCell(grid, p, 102, function()
				current.sel = p.uid
				renderPanel()
			end, p.uid == current.sel)
			cell.LayoutOrder = i
		end

		local det = UI.box(c, { Size = UDim2.fromOffset(310, 470), Position = UDim2.fromOffset(714, 60), Color = UI.WHITE, Radius = 22 })
		if not selPet then
			UI.text(det, { Text = "Choisis un pet", TextSize = 20, Color = UI.MUTED })
			return
		end
		local p = selPet
		local def = Config.Pets[p.def]
		local rar = Config.Rarities[def.rarity]
		UI.viewport(det, PetModels.build(p.def, p.tier, p.shiny, 1, false, THUMB * 2), { Size = UDim2.fromOffset(170, 150), Position = UDim2.new(0.5, -85, 0, 6) })
		UI.text(det, { Text = def.name, TextSize = 22, Size = UDim2.new(1, 0, 0, 26), Position = UDim2.fromOffset(0, 156) })
		local tags = rar.name
		if p.tier > 0 then
			tags ..= " · " .. Config.TierNames[p.tier]
		end
		if p.shiny then
			tags ..= " · Brillant"
		end
		local chip = UI.box(det, { Size = UDim2.fromOffset((utf8.len(tags) or #tags) * 9 + 30, 28), Position = UDim2.new(0.5, 0, 0, 186), AnchorPoint = Vector2.new(0.5, 0), Color = rar.color, Radius = 14, Shadow = false })
		UI.text(chip, { Text = tags, TextSize = 15, Color = UI.WHITE, Outline = 2 })
		UI.text(det, { Text = "Puissance " .. fmt(p.power), TextSize = 20, Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, 222) })
		local need = 25 + 15 * p.lvl
		UI.text(det, { Text = if p.lvl >= 25 then "Niveau max (25)" else "Niveau " .. p.lvl, TextSize = 16, Size = UDim2.new(1, 0, 0, 20), Position = UDim2.fromOffset(0, 248) })
		UI.bar(det, { Size = UDim2.new(1, -50, 0, 14), Position = UDim2.fromOffset(25, 272), Color = UI.MINT, Value = if p.lvl >= 25 then 1 else p.xp / need })
		UI.button(det, { Text = if p.eq then "Retirer" else "Équiper", Color = UI.GREEN, Size = UDim2.fromOffset(134, 44), Position = UDim2.fromOffset(16, 300), TextSize = 18 }, function()
			send("equip", p.uid)
		end)
		UI.button(det, { Text = if p.lock then "Déverrouiller" else "Verrouiller", Color = UI.SKY, Size = UDim2.fromOffset(134, 44), Position = UDim2.fromOffset(160, 300), TextSize = 17 }, function()
			send("lock", p.uid)
		end)
		if p.tier < 2 and (p.bonus or 0) == 0 then
			local n = 0
			for _, o in S.pets do
				if o.def == p.def and o.tier == p.tier and (o.uid == p.uid or not o.lock) and (o.bonus or 0) == 0 then
					n += 1
				end
			end
			local kind = if p.tier == 0 then "dorée" else "arc-en-ciel"
			UI.button(det, { Text = string.format("Fusion %s (%d/5)", kind, math.min(n, 5)), Color = UI.ORANGE, Size = UDim2.fromOffset(278, 44), Position = UDim2.fromOffset(16, 356), TextSize = 18, Enabled = n >= 5 }, function()
				send("fuse", p.uid)
			end)
		end
		UI.button(det, { Text = "Supprimer", Color = UI.RED, Size = UDim2.fromOffset(278, 44), Position = UDim2.fromOffset(16, 412), TextSize = 18, Enabled = not p.lock }, function()
			if def.rarity >= Config.LEGENDARY or p.tier > 0 then
				popup("Supprimer ?", "Veux-tu vraiment supprimer " .. def.name .. " ? C'est définitif.", "Supprimer", function()
					send("delete", p.uid)
					current.sel = nil
				end, true)
			else
				send("delete", p.uid)
				current.sel = nil
			end
		end)
	end,
}

-- Index -------------------------------------------------------------------
local function realChance(eggId: string, petId: string): number
	local egg = Config.Eggs[eggId]
	local total, mine = 0, 0
	for _, e in egg.pets do
		local w = e.chance
		if Config.Pets[e.pet].rarity >= Config.RARE then
			w *= S.luck
		end
		total += w
		if e.pet == petId then
			mine = w
		end
	end
	return mine / total * 100
end

panels.index = {
	title = "Index des pets",
	color = UI.LILAC,
	w = 1080,
	h = 610,
	sig = function()
		return string.format("%d,%d,%d,%.2f", current.tab, S.indexCount, S.indexClaim, S.luck)
	end,
	build = function(c)
		local names = {}
		for _, w in Config.Worlds do
			table.insert(names, w.name)
		end
		table.insert(names, "Exclusifs")
		tabs(c, names, UI.LILAC)
		local groups = {}
		if current.tab <= #Config.Worlds then
			for _, eggId in Config.Worlds[current.tab].eggs do
				local egg = Config.Eggs[eggId]
				local ids = {}
				for _, e in egg.pets do
					table.insert(ids, e.pet)
				end
				table.insert(groups, { title = egg.name .. " · " .. fmt(egg.price) .. " pièces", ids = ids, egg = eggId })
			end
		else
			table.insert(groups, { title = "Récompense du boss Gummy Golem", ids = { "gummy_golem" }, egg = nil })
		end
		local y = 54
		for _, g in groups do
			UI.text(c, { Text = g.title, TextSize = 19, AlignX = L, Size = UDim2.fromOffset(600, 24), Position = UDim2.fromOffset(0, y) })
			for i, id in g.ids do
				local def = Config.Pets[id]
				local found = S.discovered[id] == true
				local rc = Config.Rarities[def.rarity].color
				local card = UI.new("Frame", { BackgroundColor3 = if found then UI.lighten(def.body, 0.75) else Color3.fromHex("EDEAF6"), Size = UDim2.fromOffset(138, 160), Position = UDim2.fromOffset((i - 1) * 146, y + 28), Parent = c })
				UI.corner(card, 18)
				UI.stroke(card, if def.rarity >= Config.MYTHIC then 5 else 3.5, rc)
				UI.viewport(card, PetModels.build(id, 0, false, 1, not found, THUMB), { Size = UDim2.new(1, 0, 0, 106) })
				UI.text(card, { Text = if found then def.name else "???", TextSize = 13, Wrap = true, Size = UDim2.new(1, -8, 0, 30), Position = UDim2.fromOffset(4, 104) })
				local ch = if g.egg then Config.fmtChance(realChance(g.egg, id)) else "1re victoire"
				UI.text(card, { Text = Config.Rarities[def.rarity].name .. " · " .. ch, TextSize = 12, Color = UI.darken(rc, 0.2), Size = UDim2.new(1, -8, 0, 18), Position = UDim2.fromOffset(4, 136) })
			end
			y += 200
		end
		local total = #Config.PetOrder
		local by = 494
		UI.text(c, { Text = string.format("Collection : %d / %d", S.indexCount, total), TextSize = 19, AlignX = L, Size = UDim2.fromOffset(230, 46), Position = UDim2.fromOffset(0, by) })
		UI.bar(c, { Size = UDim2.fromOffset(440, 26), Position = UDim2.fromOffset(240, by + 10), Color = UI.LILAC, Value = S.indexCount / total })
		local m = Config.IndexMilestones[S.indexClaim + 1]
		if m then
			local need = math.min(m.need, total)
			UI.button(c, { Text = string.format("%d pets : +%d gemmes, +5 %% pièces", need, m.gems), Color = UI.GREEN, Size = UDim2.fromOffset(320, 46), Position = UDim2.fromOffset(704, by), TextSize = 17, Enabled = S.indexCount >= need }, function()
				send("index")
			end)
		else
			UI.text(c, { Text = "Tous les paliers réclamés !", TextSize = 19, AlignX = R, Size = UDim2.fromOffset(320, 46), Position = UDim2.fromOffset(704, by) })
		end
	end,
}

-- Boutique ----------------------------------------------------------------
local function anyRobux(): boolean
	for _, id in Config.GamePassIds :: any do
		if id ~= 0 then
			return true
		end
	end
	for _, p in Config.GemProducts do
		if p.id ~= 0 then
			return true
		end
	end
	return false
end

panels.shop = {
	title = "Boutique",
	color = UI.GREEN,
	w = 1080,
	h = 610,
	sig = function()
		local t = { tostring(current.tab) }
		for _, u in Config.Upgrades do
			local lvl = S.upgrades[u.id] or 0
			local cost = Config.upgradeCost(u, lvl)
			table.insert(t, string.format("%d%s", lvl, tostring((if u.gem then S.gems else S.coins) >= cost)))
		end
		for id, on in S.passes do
			table.insert(t, id .. tostring(on))
		end
		table.insert(t, tostring(math.min(S.gems, 400)))
		for id, left in S.potions do
			table.insert(t, id .. math.floor(left / 10))
		end
		return table.concat(t, ",")
	end,
	build = function(c)
		local names = { "Améliorations", "Gemmes", "Potions et passes" }
		if anyRobux() then
			table.insert(names, "Robux")
		end
		tabs(c, names, UI.GREEN)
		local list = scroller(c, UDim2.new(1, 0, 1, -56), UDim2.fromOffset(0, 56))
		UI.new("UIGridLayout", { CellSize = UDim2.fromOffset(500, 100), CellPadding = UDim2.fromOffset(16, 14), SortOrder = Enum.SortOrder.LayoutOrder, Parent = list })
		UI.new("UIPadding", { PaddingTop = UDim.new(0, 6), PaddingLeft = UDim.new(0, 4), Parent = list })
		local order = 0
		local function card(name: string, desc: string, level: string, price: string, enabled: boolean, onBuy: (() -> ())?)
			order += 1
			local holder = UI.new("Frame", { BackgroundTransparency = 1, LayoutOrder = order, Parent = list })
			local f = UI.new("Frame", { BackgroundColor3 = UI.WHITE, Size = UDim2.new(1, -6, 1, -6), Parent = holder })
			UI.corner(f, 20)
			UI.stroke(f, 3.5)
			UI.text(f, { Text = name, TextSize = 21, AlignX = L, Size = UDim2.new(1, -190, 0, 26), Position = UDim2.fromOffset(18, 10) })
			UI.text(f, { Text = desc, TextSize = 15, Color = Color3.fromHex("5A4A7A"), AlignX = L, Size = UDim2.new(1, -190, 0, 22), Position = UDim2.fromOffset(18, 38) })
			UI.text(f, { Text = level, TextSize = 14, Color = UI.MUTED, AlignX = L, Size = UDim2.new(1, -190, 0, 20), Position = UDim2.fromOffset(18, 62) })
			UI.button(f, { Text = price, Color = UI.GREEN, Size = UDim2.fromOffset(160, 50), Position = UDim2.new(1, -176, 0, 22), TextSize = 19, Enabled = enabled and onBuy ~= nil }, onBuy)
		end
		if current.tab == 1 or current.tab == 2 then
			for _, u in Config.Upgrades do
				if u.gem ~= (current.tab == 2) then
					continue
				end
				local lvl = S.upgrades[u.id] or 0
				if lvl >= u.max then
					card(u.name, u.desc, string.format("Nv %d/%d", lvl, u.max), "MAX", false, nil)
				else
					local cost = Config.upgradeCost(u, lvl)
					local have = if u.gem then S.gems else S.coins
					card(u.name, u.desc, string.format("Nv %d/%d", lvl, u.max), (if u.gem then "💎 " else "🪙 ") .. fmt(cost), have >= cost, function()
						send("upgrade", u.id)
					end)
				end
			end
		elseif current.tab == 3 then
			for _, p in Config.Potions do
				local left = S.potions[p.id] or 0
				card(p.name, "Cumulable : ajoute 10 minutes", if left > 0 then "Actif : " .. Config.fmtTime(left) else "10 minutes", "💎 " .. p.gems, S.gems >= p.gems, function()
					send("potion", p.id)
				end)
			end
			for _, p in Config.Passes do
				local robuxId = (Config.GamePassIds :: any)[p.id]
				if S.passes[p.id] then
					card(p.name, p.desc, "Pass permanent", "Acheté", false, nil)
				elseif robuxId ~= 0 then
					card(p.name, p.desc, "Pass permanent", "R$", true, function()
						MarketplaceService:PromptGamePassPurchase(player, robuxId)
					end)
				else
					card(p.name, p.desc, "Pass permanent", "💎 " .. p.gems, S.gems >= p.gems, function()
						send("pass", p.id)
					end)
				end
			end
		else
			for _, prod in Config.GemProducts do
				if prod.id ~= 0 then
					card(prod.label, "Des gemmes pour la boutique", "Achat Robux", "R$", true, function()
						MarketplaceService:PromptProductPurchase(player, prod.id)
					end)
				end
			end
		end
	end,
}

-- Quêtes ------------------------------------------------------------------
local function rewardText(q): string
	local parts = {}
	if q.coins > 0 then
		table.insert(parts, fmt(q.coins) .. " pièces")
	end
	if q.gems > 0 then
		table.insert(parts, q.gems .. " gemmes")
	end
	return table.concat(parts, " + ")
end

panels.quests = {
	title = "Quêtes",
	color = UI.YELLOW,
	w = 900,
	h = 580,
	sig = function()
		local t = { S.quest, math.floor(S.questProgress) }
		for _, d in S.daily do
			table.insert(t, math.floor(d.progress) .. tostring(d.claimed))
		end
		return table.concat(t, ",")
	end,
	build = function(c)
		UI.text(c, { Text = "Aventure", TextSize = 24, AlignX = L, Size = UDim2.fromOffset(300, 28), Position = UDim2.fromOffset(0, 0) })
		local q = Config.StarterQuests[S.quest]
		local qc = UI.box(c, { Size = UDim2.new(1, 0, 0, 112), Position = UDim2.fromOffset(0, 34), Color = UI.WHITE, Radius = 22 })
		if not q then
			UI.text(qc, { Text = "Bravo, tu as terminé toutes les quêtes d'aventure !", TextSize = 22 })
		else
			local nb = UI.box(qc, { Size = UDim2.fromOffset(60, 60), Position = UDim2.fromOffset(20, 24), Color = UI.PINK, Radius = 18, Shadow = false })
			UI.text(nb, { Text = tostring(S.quest), TextSize = 28, Color = UI.WHITE, Outline = 3 })
			UI.text(qc, { Text = q.text, TextSize = 22, AlignX = L, Size = UDim2.fromOffset(520, 28), Position = UDim2.fromOffset(100, 14) })
			UI.bar(qc, { Size = UDim2.fromOffset(420, 26), Position = UDim2.fromOffset(100, 50), Color = UI.YELLOW, Value = S.questProgress / q.goal })
			UI.text(qc, { Text = fmt(math.min(S.questProgress, q.goal)) .. " / " .. fmt(q.goal), TextSize = 15, Size = UDim2.fromOffset(420, 26), Position = UDim2.fromOffset(100, 50) })
			UI.text(qc, { Text = "Récompense : " .. rewardText(q), TextSize = 16, Color = Color3.fromHex("5A4A7A"), AlignX = R, Size = UDim2.new(1, -20, 0, 22), Position = UDim2.fromOffset(0, 84) })
			UI.button(qc, { Text = "Réclamer", Color = UI.GREEN, Size = UDim2.fromOffset(150, 46), Position = UDim2.new(1, -170, 0, 20), Enabled = S.questProgress >= q.goal }, function()
				send("quest")
			end)
		end
		UI.text(c, { Text = "Quêtes du jour (changent à minuit UTC)", TextSize = 22, AlignX = L, Size = UDim2.fromOffset(600, 28), Position = UDim2.fromOffset(0, 164) })
		for i, d in S.daily do
			local f = UI.box(c, { Size = UDim2.new(1, 0, 0, 84), Position = UDim2.fromOffset(0, 198 + (i - 1) * 96), Color = UI.WHITE, Radius = 20 })
			UI.text(f, { Text = string.format(Config.DailyText[d.kind], fmt(d.target)), TextSize = 20, AlignX = L, Size = UDim2.fromOffset(520, 26), Position = UDim2.fromOffset(20, 10) })
			UI.bar(f, { Size = UDim2.fromOffset(420, 24), Position = UDim2.fromOffset(20, 44), Color = UI.SKY, Value = d.progress / d.target })
			UI.text(f, { Text = fmt(math.min(d.progress, d.target)) .. " / " .. fmt(d.target), TextSize = 14, Size = UDim2.fromOffset(420, 24), Position = UDim2.fromOffset(20, 44) })
			UI.text(f, { Text = "💎 +" .. d.gems, TextSize = 20, AlignX = L, Size = UDim2.fromOffset(120, 30), Position = UDim2.fromOffset(470, 40) })
			if d.claimed then
				UI.text(f, { Text = "Réclamée", TextSize = 20, Color = UI.MUTED, Size = UDim2.fromOffset(150, 84), Position = UDim2.new(1, -170, 0, 0) })
			else
				UI.button(f, { Text = "Réclamer", Color = UI.GREEN, Size = UDim2.fromOffset(150, 46), Position = UDim2.new(1, -170, 0, 18), Enabled = d.progress >= d.target }, function()
					send("daily", i)
				end)
			end
		end
	end,
}

-- Mondes ------------------------------------------------------------------
local THEME_ICON = { meadow = "🍬", choco = "🍫", ice = "🍦", galaxy = "🌌" }

panels.worlds = {
	title = "Mondes",
	color = UI.MINT,
	w = 1100,
	h = 470,
	sig = function()
		local nw = Config.Worlds[S.maxWorld + 1]
		return string.format("%d,%d,%s", S.world, S.maxWorld, tostring(nw ~= nil and S.coins >= nw.unlock))
	end,
	build = function(c)
		local cw = (1100 - 56 - 3 * 16) / 4
		for i, w in Config.Worlds do
			local f = UI.box(c, { Size = UDim2.fromOffset(cw, 380), Position = UDim2.fromOffset((i - 1) * (cw + 16), 8), Color = w.ground, Radius = 22 })
			local tc = if w.theme == "galaxy" then UI.WHITE else UI.INK
			local pic = UI.new("Frame", { BackgroundColor3 = w.plaza, Size = UDim2.new(1, -28, 0, 150), Position = UDim2.fromOffset(14, 14), Parent = f })
			UI.corner(pic, 16)
			UI.stroke(pic, 3)
			UI.text(pic, { Text = if i > S.maxWorld then "🔒" else (THEME_ICON :: any)[w.theme], TextSize = 70 })
			UI.text(f, { Text = w.name, TextSize = 22, Color = tc, Size = UDim2.new(1, 0, 0, 28), Position = UDim2.fromOffset(0, 176) })
			UI.text(f, { Text = "Pièces x" .. w.coinMult, TextSize = 17, Color = tc, Size = UDim2.new(1, 0, 0, 22), Position = UDim2.fromOffset(0, 210) })
			UI.text(f, { Text = "Bonbons x" .. fmt(w.scale) .. " plus durs", TextSize = 15, Color = tc, Size = UDim2.new(1, 0, 0, 20), Position = UDim2.fromOffset(0, 234) })
			if i > 1 then
				UI.text(f, { Text = "Prix : " .. fmt(w.unlock) .. " pièces", TextSize = 15, Color = tc, Size = UDim2.new(1, 0, 0, 20), Position = UDim2.fromOffset(0, 258) })
			end
			local bpos = UDim2.new(0, 16, 1, -70)
			local bsize = UDim2.new(1, -32, 0, 52)
			if i == S.world then
				UI.button(f, { Text = "Tu es ici", Size = bsize, Position = bpos, Enabled = false })
			elseif i <= S.maxWorld then
				UI.button(f, { Text = "Voyager", Color = UI.SKY, Size = bsize, Position = bpos }, function()
					send("teleport", i)
					closePanel()
				end)
			elseif i == S.maxWorld + 1 then
				UI.button(f, { Text = "Débloquer " .. fmt(w.unlock), Color = UI.GREEN, Size = bsize, Position = bpos, TextSize = 18, Enabled = S.coins >= w.unlock }, function()
					send("unlock")
					closePanel()
				end)
			else
				UI.button(f, { Text = "Verrouillé", Size = bsize, Position = bpos, Enabled = false })
			end
		end
	end,
}

-- Cadeau du jour ----------------------------------------------------------
panels.gift = {
	title = "Cadeau du jour",
	color = UI.ORANGE,
	w = 1060,
	h = 420,
	sig = function()
		return string.format("%s,%d,%d", tostring(S.giftReady), S.giftNext, S.giftStreak)
	end,
	build = function(c)
		local cw = (1060 - 56 - 6 * 12) / 7
		for d = 1, 7 do
			local label = if d == 1 then fmt(S.giftCoins) .. " pièces" else Config.GiftLabels[d]
			local state = 0
			if S.giftReady and d == S.giftNext then
				state = 2
			elseif (not S.giftReady and d <= S.giftStreak) or (S.giftReady and d < S.giftNext) then
				state = 1
			end
			local color = if state == 1 then Color3.fromHex("DDF8EC") elseif state == 2 then Color3.fromHex("FFF3B8") else UI.WHITE
			local f = UI.box(c, { Size = UDim2.fromOffset(cw, 200), Position = UDim2.fromOffset((d - 1) * (cw + 12), 20), Color = color, Radius = 20, Stroke = if state == 2 then 6 else 3.5 })
			UI.text(f, { Text = "Jour " .. d, TextSize = 20, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 8) })
			UI.text(f, { Text = if state == 1 then "✅" else "🎁", TextSize = 54, Size = UDim2.new(1, 0, 0, 80), Position = UDim2.fromOffset(0, 44) })
			UI.text(f, { Text = label, TextSize = 15, Wrap = true, Size = UDim2.new(1, -12, 0, 50), Position = UDim2.fromOffset(6, 136) })
		end
		if S.giftReady then
			UI.button(c, { Text = "Récupérer", Color = UI.GREEN, Size = UDim2.fromOffset(300, 64), Position = UDim2.new(0.5, -150, 0, 260), TextSize = 26 }, function()
				send("gift")
			end)
		else
			UI.text(c, { Text = "Reviens demain pour le jour suivant !", TextSize = 22, Size = UDim2.new(1, 0, 0, 64), Position = UDim2.fromOffset(0, 260) })
		end
	end,
}

-- Rebirth -----------------------------------------------------------------
panels.rebirth = {
	title = "Rebirth",
	color = UI.PURPLE,
	w = 760,
	h = 520,
	sig = function()
		return string.format("%d,%s", S.rebirths, tostring(S.coins >= S.rebirthCost))
	end,
	build = function(c)
		local cur, nxt = Config.rebirthMult(S.rebirths), Config.rebirthMult(S.rebirths + 1)
		UI.text(c, { Text = "REBIRTH " .. (S.rebirths + 1), TextSize = 44, Color = UI.YELLOW, Outline = 4, Size = UDim2.new(1, 0, 0, 50), Position = UDim2.fromOffset(0, 0) })
		local a = UI.box(c, { Size = UDim2.fromOffset(190, 80), Position = UDim2.new(0.5, -240, 0, 66), Color = UI.WHITE, Radius = 20 })
		UI.text(a, { Text = "x" .. cur, TextSize = 34 })
		UI.text(c, { Text = "➜", TextSize = 50, Color = UI.YELLOW, Outline = 3, Size = UDim2.fromOffset(80, 80), Position = UDim2.new(0.5, -40, 0, 66) })
		local b = UI.box(c, { Size = UDim2.fromOffset(190, 80), Position = UDim2.new(0.5, 50, 0, 66), Color = Color3.fromHex("FFF3B8"), Radius = 20 })
		UI.text(b, { Text = "x" .. nxt, TextSize = 34 })
		UI.text(c, { Text = "Multiplicateur de pièces permanent", TextSize = 18, Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, 160) })
		UI.text(c, { Text = "Tu gardes : pets, gemmes, améliorations, passes", TextSize = 19, Color = Color3.fromHex("1E9E63"), Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, 200) })
		UI.text(c, { Text = "Tu perds : pièces et mondes débloqués", TextSize = 19, Color = Color3.fromHex("C2185B"), Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, 228) })
		UI.text(c, { Text = "Bonus : +" .. (10 * (S.rebirths + 1)) .. " gemmes", TextSize = 19, Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, 256) })
		UI.bar(c, { Size = UDim2.fromOffset(500, 34), Position = UDim2.new(0.5, -250, 0, 296), Color = UI.YELLOW, Value = S.coins / S.rebirthCost })
		UI.text(c, { Text = fmt(math.min(S.coins, S.rebirthCost)) .. " / " .. fmt(S.rebirthCost), TextSize = 18, Size = UDim2.fromOffset(500, 34), Position = UDim2.new(0.5, -250, 0, 296) })
		UI.button(c, { Text = "Faire un Rebirth", Color = UI.PURPLE, Size = UDim2.fromOffset(320, 64), Position = UDim2.new(0.5, -160, 0, 356), TextSize = 24, Enabled = S.coins >= S.rebirthCost }, function()
			popup("Rebirth ?", "Tes pièces et tes mondes repartent à zéro, mais tu gagnes x" .. nxt .. " pièces pour toujours.", "C'est parti !", function()
				send("rebirth")
				closePanel()
			end, true)
		end)
	end,
}

-- Réglages ----------------------------------------------------------------
panels.settings = {
	title = "Réglages",
	color = Color3.fromHex("9C93C9"),
	w = 760,
	h = 520,
	sig = function()
		return tostring(muted) .. math.floor(S.stats.play / 10)
	end,
	build = function(c)
		local row = UI.box(c, { Size = UDim2.new(1, 0, 0, 64), Position = UDim2.fromOffset(0, 8), Color = UI.WHITE, Radius = 20 })
		UI.text(row, { Text = "Son", TextSize = 22, AlignX = L, Size = UDim2.new(1, -40, 1, 0), Position = UDim2.fromOffset(24, 0) })
		UI.button(row, { Text = if muted then "NON" else "OUI", Color = if muted then UI.RED else UI.GREEN, Size = UDim2.fromOffset(90, 40), Position = UDim2.new(1, -110, 0, 12) }, function()
			muted = not muted
			renderPanel()
		end)
		local st = S.stats
		local items = {
			{ "Temps de jeu", Config.fmtTime(st.play) },
			{ "Pièces récoltées", fmt(S.totalCoins) },
			{ "Œufs ouverts", fmt(st.hatched) },
			{ "Tas cassés", fmt(st.piles) },
			{ "Clics", fmt(st.taps) },
			{ "Plus gros coup", fmt(st.bestHit) },
			{ "Boss vaincus", fmt(st.bosses) },
			{ "Pets découverts", string.format("%d / %d", S.indexCount, #Config.PetOrder) },
		}
		UI.text(c, { Text = "Statistiques", TextSize = 22, AlignX = L, Size = UDim2.fromOffset(300, 28), Position = UDim2.fromOffset(0, 86) })
		for i, it in items do
			local f = UI.new("Frame", { BackgroundColor3 = UI.WHITE, Size = UDim2.fromOffset(340, 40), Position = UDim2.fromOffset(((i - 1) % 2) * 364, 120 + ((i - 1) // 2) * 48), Parent = c })
			UI.corner(f, 14)
			UI.stroke(f, 2.5)
			UI.text(f, { Text = it[1], TextSize = 17, AlignX = L, Size = UDim2.new(1, -28, 1, 0), Position = UDim2.fromOffset(14, 0) })
			UI.text(f, { Text = it[2], TextSize = 17, AlignX = R, Size = UDim2.new(1, -28, 1, 0), Position = UDim2.fromOffset(14, 0) })
		end
		UI.text(c, { Text = "Raccourcis : P pets · I index · B boutique · J quêtes · C mondes · G cadeau · R rebirth · F récolte auto · E ouvrir un œuf", TextSize = 14, Wrap = true, Color = Color3.fromHex("5A4A7A"), Size = UDim2.new(1, 0, 0, 40), Position = UDim2.fromOffset(0, 320) })
		if not S.canSave then
			UI.text(c, { Text = "⚠️ Sauvegarde désactivée. Dans Studio : Game Settings › Security › Enable Studio Access to API Services (le jeu doit être publié).", TextSize = 15, Wrap = true, Color = Color3.fromHex("C2185B"), Size = UDim2.new(1, 0, 0, 44), Position = UDim2.fromOffset(0, 366) })
		end
	end,
}

---------------------------------------------------------------------------
-- Animation d'éclosion
---------------------------------------------------------------------------
local hatchHost = UI.new("TextButton", { Name = "Hatch", Text = "", AutoButtonColor = false, BackgroundColor3 = Color3.fromHex("1B1030"), BackgroundTransparency = 0.4, Size = UDim2.fromScale(1, 1), Visible = false, ZIndex = 8, Parent = gui })
local hatchState = { t0 = 0, auto = false, eggs = {} :: { Model }, anims = {} :: { any }, open = false, revealed = false }

local function closeHatch()
	hatchState.open = false
	hatchHost.Visible = false
	hatchHost:ClearAllChildren()
	hatchState.eggs = {}
	hatchState.anims = {}
end

hatchHost.Activated:Connect(function()
	if hatchState.open and os.clock() - hatchState.t0 > 1.3 then
		closeHatch()
	end
end)

local function showHatch(data)
	closeHatch()
	hatchState.open = true
	hatchState.revealed = false
	hatchState.t0 = os.clock()
	hatchState.auto = data.auto
	hatchHost.Visible = true
	local t0 = hatchState.t0
	local n = #data.results
	local egg = Config.Eggs[data.egg]
	UI.text(hatchHost, { Text = egg.name, TextSize = 40, Color = UI.WHITE, Outline = 4, Size = UDim2.new(1, 0, 0, 50), Position = UDim2.new(0, 0, 0, 70) })
	local slots = {}
	for i = 1, n do
		local x = (i - (n + 1) / 2) * 380
		local slot = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(340, 460), Position = UDim2.new(0.5, x - 170, 0.5, -230), Parent = hatchHost })
		local model = PetModels.egg(data.egg, 1)
		UI.viewport(slot, model, { Size = UDim2.fromOffset(340, 300), Distance = 15, Yaw = 0 })
		table.insert(hatchState.eggs, model)
		slots[i] = slot
	end
	play("hatch")
	task.delay(1.0, function()
		if not hatchState.open or hatchState.t0 ~= t0 then
			return
		end
		hatchState.revealed = true
		hatchState.eggs = {}
		local best = 1
		for i, r in data.results do
			local def = Config.Pets[r.def]
			best = math.max(best, def.rarity)
			local slot = slots[i]
			slot:ClearAllChildren()
			local rar = Config.Rarities[def.rarity]
			local glow = UI.new("Frame", { BackgroundColor3 = UI.lighten(rar.color, 0.4), BackgroundTransparency = 0.45, Size = UDim2.fromOffset(280, 280), Position = UDim2.fromOffset(30, 10), Parent = slot })
			UI.corner(glow, 140)
			local vpHolder = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(340, 300), Parent = slot })
			local sc = UI.new("UIScale", { Scale = 0.2, Parent = vpHolder })
			local revealed = PetModels.build(r.def, 0, r.shiny, 1)
			UI.viewport(vpHolder, revealed, { Zoom = 0.85 })
			local anim = PetModels.animator(revealed)
			if anim then
				table.insert(hatchState.anims, { anim = anim, pivot = revealed:GetPivot() })
			end
			TweenService:Create(sc, TweenInfo.new(0.45, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
			UI.text(slot, { Text = def.name, TextSize = 32, Color = UI.WHITE, Outline = 3.5, Size = UDim2.new(1, 0, 0, 40), Position = UDim2.fromOffset(0, 300) })
			local chip = UI.box(slot, { Size = UDim2.fromOffset((utf8.len(rar.name) or #rar.name) * 12 + 40, 36), Position = UDim2.new(0.5, 0, 0, 346), AnchorPoint = Vector2.new(0.5, 0), Color = rar.color, Radius = 16 })
			UI.text(chip, { Text = rar.name, TextSize = 20, Color = UI.WHITE, Outline = 2.5 })
			UI.text(slot, { Text = "Puissance " .. fmt(r.power) .. " · " .. Config.fmtChance(r.chance), TextSize = 20, Color = UI.YELLOW, Outline = 2.5, Size = UDim2.new(1, 0, 0, 26), Position = UDim2.fromOffset(0, 392) })
			local tagY = 0
			local function tag(text: string, color: Color3)
				local t = UI.box(slot, { Size = UDim2.fromOffset(150, 38), Position = UDim2.fromOffset(190, tagY), Color = color, Radius = 14 })
				UI.text(t, { Text = text, TextSize = 18 })
				tagY += 46
			end
			if r.new then
				tag("NOUVEAU !", UI.YELLOW)
			end
			if r.shiny then
				tag("BRILLANT !", UI.SKY)
			end
			if r.deleted then
				tag("Auto-supprimé", UI.GRAY)
			end
		end
		play(if best >= Config.DIVINE then "divine" elseif best >= Config.LEGENDARY then "legend" elseif best >= 3 then "reveal_rare" else "reveal")
		if best >= Config.MYTHIC then
			-- révélation spéciale : flash, rayons et grand titre
			local divine = best >= Config.DIVINE
			local col = Config.Rarities[best].color
			local flash = UI.new("Frame", { BackgroundColor3 = if divine then Color3.fromHex("FFF3B8") else UI.lighten(col, 0.4), BackgroundTransparency = 0, Size = UDim2.fromScale(1, 1), ZIndex = 9, Parent = hatchHost })
			TweenService:Create(flash, TweenInfo.new(0.9), { BackgroundTransparency = 1 }):Play()
			Debris:AddItem(flash, 1)
			local rays = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromOffset(900, 900), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), ZIndex = 1, Parent = hatchHost })
			for k = 0, 11 do
				local ray = UI.new("Frame", { BackgroundColor3 = col, BackgroundTransparency = 0.6, BorderSizePixel = 0, Size = UDim2.fromOffset(60, 900), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), Rotation = k * 15, Parent = rays })
				UI.corner(ray, 30)
			end
			rays:SetAttribute("Spin", true)
			local title = UI.text(hatchHost, { Text = if divine then "✨ DIVIN ✨" else "MYTHIQUE !", TextSize = 64, Color = col, Outline = 5, Size = UDim2.new(1, 0, 0, 80), Position = UDim2.new(0, 0, 0, 120) })
			local sc = UI.new("UIScale", { Scale = 0.3, Parent = title })
			TweenService:Create(sc, TweenInfo.new(0.5, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
			local cam = workspace.CurrentCamera
			if cam and divine then
				task.spawn(function()
					for _ = 1, 18 do
						cam.CFrame *= CFrame.new((math.random() - 0.5) * 0.4, (math.random() - 0.5) * 0.4, 0)
						task.wait()
					end
				end)
			end
		end
		local hint = if hatchState.auto then "Auto-éclosion en cours…" else "Clique pour continuer"
		UI.text(hatchHost, { Text = hint, TextSize = 22, Color = UI.WHITE, Outline = 3, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.new(0, 0, 1, -60) })
		local stay = if hatchState.auto then (if best >= Config.LEGENDARY then 2.6 else 1.3) else 2.6
		task.delay(stay, function()
			if hatchState.open and hatchState.t0 == t0 then
				closeHatch()
			end
		end)
	end)
end

---------------------------------------------------------------------------
-- Effets dans le monde : nombres flottants, pièces, confettis
---------------------------------------------------------------------------
local fxFolder = UI.new("Folder", { Name = "ClientFx", Parent = workspace })

local function floatText(pos: Vector3, text: string, color: Color3, size: number)
	local anchor = UI.new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, Transparency = 1, Size = Vector3.one * 0.2, Position = pos, Parent = fxFolder })
	local bb = UI.new("BillboardGui", { Size = UDim2.fromOffset(320, 60), AlwaysOnTop = true, LightInfluence = 0, MaxDistance = 150, Adornee = anchor, Parent = anchor })
	local t = UI.text(bb, { Text = text, TextSize = size, Color = color, Outline = 3 })
	local s = t:FindFirstChildOfClass("UIStroke")
	local fade = TweenInfo.new(0.5, Enum.EasingStyle.Linear, Enum.EasingDirection.In, 0, false, 0.5)
	TweenService:Create(bb, TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { StudsOffsetWorldSpace = Vector3.new(0, 4, 0) }):Play()
	TweenService:Create(t, fade, { TextTransparency = 1 }):Play()
	if s then
		TweenService:Create(s, fade, { Transparency = 1 }):Play()
	end
	Debris:AddItem(anchor, 1.1)
end

local function hrp(): BasePart?
	local char = player.Character
	return if char then char:FindFirstChild("HumanoidRootPart") :: BasePart? else nil
end

local function coinBurst(from: Vector3, n: number, color: Color3)
	local root = hrp()
	if not root then
		return
	end
	for i = 1, n do
		local start = from + Vector3.new(math.random() * 4 - 2, 2 + math.random() * 2, math.random() * 4 - 2)
		local coin = UI.new("Part", { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.3, 1.2, 1.2), Color = color, Material = Enum.Material.Neon, Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, CFrame = CFrame.new(start) * CFrame.Angles(0, 0, math.rad(90)), Parent = fxFolder })
		TweenService:Create(coin, TweenInfo.new(0.35 + i * 0.05, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { CFrame = root.CFrame * CFrame.Angles(0, 0, math.rad(90)) }):Play()
		Debris:AddItem(coin, 0.7)
	end
end

local function confetti(pos: Vector3, colors: { Color3 })
	local cam = workspace.CurrentCamera
	if not cam or (cam.CFrame.Position - pos).Magnitude > 160 then
		return
	end
	for _ = 1, 10 do
		local p = UI.new("Part", { Size = Vector3.new(0.8, 0.2, 0.5), Color = colors[math.random(1, #colors)], Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, Position = pos + Vector3.new(0, 2, 0), Parent = fxFolder })
		local dir = Vector3.new(math.random() * 2 - 1, math.random() * 1.5 + 0.5, math.random() * 2 - 1).Unit * (6 + math.random() * 6)
		TweenService:Create(p, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Position = pos + dir, Transparency = 1, Orientation = Vector3.new(math.random(0, 360), math.random(0, 360), 0) }):Play()
		Debris:AddItem(p, 0.7)
	end
end

local pickup, pickupT = 0, 0

---------------------------------------------------------------------------
-- Pets de tous les joueurs
---------------------------------------------------------------------------
local petFolder = UI.new("Folder", { Name = "ClientPets", Parent = workspace })
local pileFolder = workspace:WaitForChild("Piles")
local map = workspace:WaitForChild("Map")

type PetView = { model: Model, pos: Vector3, rainbow: { BasePart }, anim: any, scale: number }
type View = { sig: string, pets: { PetView } }
local views: { [Player]: View } = {}

local function clearView(plr: Player)
	local v = views[plr]
	if v then
		for _, pv in v.pets do
			pv.model:Destroy()
		end
		views[plr] = nil
	end
end

local function buildView(plr: Player, sig: string, start: Vector3): View
	clearView(plr)
	local v: View = { sig = sig, pets = {} }
	for entry in string.gmatch(sig, "[^|]+") do
		local def, tier, shiny = string.match(entry, "^([%w_]+):(%d+):(%d)$")
		if def and Config.Pets[def] then
			local t = tonumber(tier) or 0
			local sc = Config.Pets[def].scale
			local model = PetModels.build(def, t, shiny == "1", sc)
			local rainbow = {}
			for _, d in model:GetChildren() do
				if d:IsA("BasePart") and t == 2 and d.Name == "Body" then
					table.insert(rainbow, d)
				end
			end
			local anim = PetModels.animator(model)
			model.Parent = petFolder
			table.insert(v.pets, { model = model, pos = start, rainbow = rainbow, anim = anim, scale = sc })
		end
	end
	views[plr] = v
	return v
end

Players.PlayerRemoving:Connect(clearView)

local function updatePets(dt: number)
	local now = os.clock()
	local cam = workspace.CurrentCamera
	local camPos = if cam then cam.CFrame.Position else Vector3.zero
	local arena = map:FindFirstChild("BossArena")
	local golem = if arena then arena:FindFirstChild("GummyGolem") :: Model? else nil
	for _, plr in Players:GetPlayers() do
		local char = plr.Character
		local root = if char then char:FindFirstChild("HumanoidRootPart") :: BasePart? else nil
		if not root then
			continue
		end
		local sig = (plr:GetAttribute("PetsEquipped") :: string?) or ""
		local v = views[plr]
		if not v or v.sig ~= sig then
			v = buildView(plr, sig, root.Position)
		end
		if (root.Position - camPos).Magnitude > 320 then
			continue
		end
		local targets = string.split((plr:GetAttribute("PetTargets") :: string?) or "", ",")
		local inBoss = plr:GetAttribute("InBoss") == true
		local n = #v.pets
		local floorY = root.Position.Y - 3
		local cf = root.CFrame
		for i, pv in v.pets do
			local lift = 1.1 * pv.scale
			local goal: Vector3? = nil
			local look = Vector3.zero
			local attacking = false
			if inBoss and golem then
				local gp = golem:GetPivot().Position
				local ang = math.pi * (0.15 + 0.7 * (i - 0.5) / math.max(n, 1))
				goal = Vector3.new(gp.X + math.cos(ang) * 16, floorY + lift, gp.Z + 11 + math.sin(ang) * 6)
				look = gp
				attacking = true
			elseif targets[i] and targets[i] ~= "0" and targets[i] ~= "" then
				local pile = pileFolder:FindFirstChild(targets[i]) :: Model?
				if pile then
					local pp = pile:GetPivot().Position
					local ang = i / math.max(n, 1) * math.pi * 2 + now * 0.4
					local r = 5.5 + (pv.scale - 1) * 3
					goal = Vector3.new(pp.X + math.cos(ang) * r, floorY + lift, pp.Z + math.sin(ang) * r)
					look = pp
					attacking = true
				end
			end
			if not goal then
				local row = (i - 1) // 6
				local inRow = math.min(6, n - row * 6)
				local col = (i - 1) % 6 - (inRow - 1) / 2
				local base = Vector3.new(root.Position.X, floorY + lift, root.Position.Z)
				local flat = Vector3.new(cf.LookVector.X, 0, cf.LookVector.Z)
				if flat.Magnitude < 0.01 then
					flat = Vector3.new(0, 0, -1)
				end
				flat = flat.Unit
				local right = Vector3.new(-flat.Z, 0, flat.X)
				local gap = 3.2 * math.max(1, pv.scale * 0.9)
				local g = base - flat * (4 + gap * 0.5 + row * 3.4 + math.abs(col) * 0.6) + right * (col * gap)
				goal = g
				look = g + flat
			end
			local g = goal :: Vector3
			local d = g - pv.pos
			local dist = d.Magnitude
			if dist > 150 then
				pv.pos = g
			elseif dist > 0.05 then
				local speed = if attacking then 45 else math.max(26, dist * 5)
				pv.pos += d.Unit * math.min(dist, speed * dt)
			end
			local hop
			if attacking and dist < 1.5 then
				hop = math.abs(math.sin(now * 12 + i)) * 1.3
			elseif dist > 0.5 then
				hop = math.abs(math.sin(now * 10 + i)) * 0.6
			else
				hop = (math.sin(now * 2 + i) + 1) * 0.12
			end
			local dir = Vector3.new(look.X - pv.pos.X, 0, look.Z - pv.pos.Z)
			local p = pv.pos + Vector3.new(0, hop, 0)
			local pivot = if dir.Magnitude > 0.1 then CFrame.lookAt(p, p + dir) else pv.model:GetPivot().Rotation + p
			if pv.anim then
				-- pets rares : animation des os selon ce que fait le pet
				local state = if attacking and dist < 1.5 then "ability" elseif dist > 0.5 then "move" else "idle"
				PetModels.pose(pv.anim, pivot, state, now + i * 0.37, dt)
				pv.model.WorldPivot = pivot
			else
				pv.model:PivotTo(pivot)
			end
			for k, part in pv.rainbow do
				part.Color = Color3.fromHSV((now * 0.25 + i * 0.1 + k * 0.05) % 1, 0.45, 1)
			end
		end
	end
end

---------------------------------------------------------------------------
-- Mise à jour du HUD à partir de l'état
---------------------------------------------------------------------------
local eggStands: { [string]: BasePart } = {}
for _, d in map:GetDescendants() do
	local id = d:GetAttribute("Egg")
	if d:IsA("BasePart") and type(id) == "string" then
		eggStands[id] = d
	end
end
local nearEgg: string? = nil

local function refreshEquippedBar()
	local eq = {}
	for _, p in sortedPets() do
		if p.eq then
			table.insert(eq, p)
		end
	end
	local sig = tostring(S.slots)
	for _, p in eq do
		sig ..= p.def .. p.tier .. tostring(p.shiny)
	end
	eqLabel.Text = string.format("Équipés %d/%d", #eq, S.slots)
	if sig == eqSig then
		return
	end
	eqSig = sig
	for _, ch in eqBar:GetChildren() do
		if ch:IsA("GuiObject") then
			ch:Destroy()
		end
	end
	local cell = 58
	local holder = eqBar.Parent :: Frame
	holder.Size = UDim2.fromOffset(S.slots * (cell + 8) + 8, 74)
	for i = 1, S.slots do
		local x = 8 + (i - 1) * (cell + 8)
		local p = eq[i]
		local f = UI.new("TextButton", { Text = "", AutoButtonColor = true, BackgroundColor3 = if p then UI.lighten(Config.Pets[p.def].body, 0.75) else UI.CREAM, Size = UDim2.fromOffset(cell, cell), Position = UDim2.fromOffset(x, 8), Parent = eqBar })
		UI.corner(f, 14)
		UI.stroke(f, 3, if p then Config.Rarities[Config.Pets[p.def].rarity].color else UI.MUTED)
		if p then
			UI.viewport(f, PetModels.build(p.def, p.tier, p.shiny, 1, false, THUMB), {})
		else
			UI.text(f, { Text = "+", TextSize = 28, Color = UI.MUTED })
		end
		f.Activated:Connect(function()
			openPanel("pets")
		end)
	end
end

local function refreshHud()
	if not S then
		return
	end
	local w = Config.Worlds[S.world]
	banner.BackgroundColor3 = w.banner
	bannerTitle.Text = w.name
	bannerSub.Text = string.format("Rebirth %d · Pièces x%s", S.rebirths, fmt(S.coinMult * w.coinMult))
	coinsText.Text = fmt(S.coins)
	gemsText.Text = fmt(S.gems)
	cpsText.Text = "+" .. fmt(S.cps) .. "/s"
	autoBtn:set(if S.autoCollect then "OUI" else "NON")
	autoBtn:recolor(if S.autoCollect then UI.GREEN else UI.RED)

	local q = Config.StarterQuests[S.quest]
	questHolder.Visible = q ~= nil
	if q then
		questTitle.Text = "Quête " .. S.quest .. " · " .. q.text
		questSet(S.questProgress / q.goal)
		if S.questProgress >= q.goal then
			questLbl.Text = "Terminé ! Clique pour réclamer"
			questBox.BackgroundColor3 = UI.lighten(UI.GREEN, 0.6)
		else
			questLbl.Text = fmt(math.min(S.questProgress, q.goal)) .. " / " .. fmt(q.goal)
			questBox.BackgroundColor3 = UI.CREAM
		end
	end

	-- pastilles des menus
	local qn = 0
	if q and S.questProgress >= q.goal then
		qn += 1
	end
	for _, d in S.daily do
		if not d.claimed and d.progress >= d.target then
			qn += 1
		end
	end
	menuBadges.quests.Text = tostring(qn)
	menuBadges.quests.Visible = qn > 0
	menuBadges.gift.Text = "!"
	menuBadges.gift.Visible = S.giftReady
	menuBadges.rebirth.Text = "!"
	menuBadges.rebirth.Visible = S.coins >= S.rebirthCost
	local m = Config.IndexMilestones[S.indexClaim + 1]
	menuBadges.index.Text = "!"
	menuBadges.index.Visible = m ~= nil and S.indexCount >= math.min(m.need, #Config.PetOrder)

	for _, p in Config.Potions do
		local left = S.potions[p.id] or 0
		timerChips[p.id].Visible = left > 0
		timerLabels[p.id].Text = string.sub(p.name, #"Potion de " + 1) .. " " .. Config.fmtTime(left)
	end
	refreshEquippedBar()

	-- aide pour les débutants
	local st = S.stats
	local hint = ""
	if S.inBoss then
		hint = ""
	elseif st.piles < 3 then
		hint = "Clique sur les tas de bonbons pour les casser avec tes pets !"
	elseif st.hatched == 0 and S.coins >= 500 then
		hint = "Tu as assez de pièces ! Va au Candy Egg (en haut) et appuie sur E"
	elseif st.hatched == 0 then
		hint = "Récolte 500 pièces pour ouvrir ton premier œuf"
	end
	hintText.Text = hint
	hintHolder.Visible = hint ~= ""
end

autoHatchBtn.frame.Activated:Connect(function()
	if not S then
		return
	end
	if S.autoHatch == nearEgg then
		send("autoHatch", nil)
	else
		send("autoHatch", nearEgg)
	end
end)

questBtn.Activated:Connect(function()
	openPanel("quests")
end)

---------------------------------------------------------------------------
-- Réception des messages du serveur
---------------------------------------------------------------------------
StateEvent.OnClientEvent:Connect(function(state)
	S = state
	refreshHud()
	refreshPanel()
end)

Fx.OnClientEvent:Connect(function(kind: string, data: any)
	if kind == "money" then
		if S then
			S.coins, S.gems, S.cps = data.coins, data.gems, data.cps
			coinsText.Text = fmt(S.coins)
			gemsText.Text = fmt(S.gems)
			cpsText.Text = "+" .. fmt(S.cps) .. "/s"
			menuBadges.rebirth.Visible = S.coins >= S.rebirthCost
			if current.name == "shop" or current.name == "worlds" or current.name == "rebirth" then
				refreshPanel()
			end
		end
	elseif kind == "toast" then
		toast(data.text, if data.color then Color3.fromHex(data.color) else nil)
	elseif kind == "tap" then
		play("tap")
		local txt = "-" .. fmt(data.dmg)
		local col, size = UI.WHITE, 26
		if data.weak then
			txt = "POINT FAIBLE ! " .. txt
			col, size = UI.YELLOW, 32
		elseif data.crit then
			txt = "CRIT ! " .. txt
			col, size = UI.ORANGE, 32
		end
		floatText(data.pos + Vector3.new(math.random() * 3 - 1.5, 0, 0), txt, col, size)
		if data.combo > 1 then
			comboText.Text = "COMBO x" .. data.combo
			comboHolder.Visible = true
			local stamp = os.clock()
			comboHolder:SetAttribute("T", stamp)
			task.delay(1, function()
				if comboHolder:GetAttribute("T") == stamp then
					comboHolder.Visible = false
				end
			end)
		end
	elseif kind == "coins" then
		play("coin")
		coinBurst(data.pos, 3, UI.YELLOW)
		pickup += data.amount
		if data.gems > 0 then
			local root = hrp()
			if root then
				floatText(root.Position + Vector3.new(0, 5, 0), "+" .. data.gems .. " gemmes", UI.SKY, 28)
			end
		end
	elseif kind == "break" then
		play("break")
		confetti(data.pos, Config.Worlds[data.world].candy)
	elseif kind == "hatch" then
		showHatch(data)
	elseif kind == "popup" then
		popup(data.title, data.body, "OK", nil, false)
	elseif kind == "panel" then
		openPanel(data.name)
	elseif kind == "levelup" then
		local root = hrp()
		if root then
			floatText(root.Position + Vector3.new(0, 6, 0), data.name .. " niveau " .. data.lvl .. " !", UI.MINT, 24)
		end
	elseif kind == "bought" then
		play("buy")
	elseif kind == "claimed" then
		play("quest")
	elseif kind == "fused" then
		play("legend")
		current.sel = data.uid
	elseif kind == "rebirth" then
		play("legend")
		toast("Rebirth " .. data.n .. " ! Pièces x" .. data.mult, UI.YELLOW)
	elseif kind == "stun" then
		local root = hrp()
		if root then
			floatText(root.Position + Vector3.new(0, 5, 0), "Étourdi !", UI.RED, 32)
		end
	elseif kind == "slam" then
		confetti(data.pos, { Color3.fromHex("6FD66F"), Color3.fromHex("CFF7CF") })
	end
end)

---------------------------------------------------------------------------
-- Panneau admin : assistant IA, actions manuelles, admin abusé, annonces traduites
-- (visible seulement pour les admins ; le serveur revérifie chaque demande)
---------------------------------------------------------------------------
local TextChatService = game:GetService("TextChatService")
local Lighting = game:GetService("Lighting")

local adm = {
	rev = 0,
	chat = {} :: { { who: string, text: string } },
	waiting = false,
	draft = "",
	target = "me",
	amount = "1M",
	pet = 1,
	tier = 0,
	shiny = false,
	count = 1,
	minutes = 5,
	value = "",
	rarity = 6,
	ann = "",
	translate = true,
	result = "",
	log = {} :: { string },
	hasKey = true,
	confirmReset = false,
}
local function admRerender()
	adm.rev += 1
	if current.name == "admin" then
		renderPanel()
	end
end

local function adminCall(kind: string, a: any?, b: any?): any
	local rf = Remotes:FindFirstChild("Admin") :: RemoteFunction?
	if not rf then
		return { ok = false, text = "Le serveur admin n'est pas prêt" }
	end
	local ok, res = pcall(rf.InvokeServer, rf, kind, a, b)
	if not ok or type(res) ~= "table" then
		return { ok = false, text = "Pas de réponse du serveur" }
	end
	return res
end

local function refreshAdminState()
	task.spawn(function()
		local st = adminCall("state")
		if st.ok then
			adm.log = st.log or {}
			adm.hasKey = st.hasKey
			admRerender()
		end
	end)
end

local function act(name: string, input: any)
	adm.result = "…"
	admRerender()
	task.spawn(function()
		local res = adminCall("act", name, input)
		adm.result = res.text or ""
		play(if res.ok then "buy" else "error")
		refreshAdminState()
	end)
end

-- « 1M », « 25k », « 3,5B » -> nombre
local function parseAmount(s: string): number
	local t = string.lower((string.gsub(s, "[%s_]", "")))
	t = (string.gsub(t, ",", "."))
	local num, suf = string.match(t, "^(%-?[%d%.]+)(%a*)$")
	local v = tonumber(num) or 0
	local mult = ({ k = 1e3, m = 1e6, b = 1e9, t = 1e12, qa = 1e15 })[suf or ""] or 1
	return v * mult
end

local function textInput(parent: Instance, props: { [string]: any }, onChange: (string) -> ()): TextBox
	local box = UI.new("TextBox", {
		Text = props.Text or "",
		PlaceholderText = props.Placeholder or "",
		PlaceholderColor3 = UI.MUTED,
		ClearTextOnFocus = false,
		MultiLine = props.Multi or false,
		TextWrapped = true,
		Font = UI.FONT,
		TextSize = props.TextSize or 18,
		TextColor3 = UI.INK,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = if props.Multi then Enum.TextYAlignment.Top else Enum.TextYAlignment.Center,
		BackgroundColor3 = UI.WHITE,
		Size = props.Size,
		Position = props.Position or UDim2.new(),
		ZIndex = 3,
		Parent = parent,
	})
	UI.corner(box, 14)
	UI.stroke(box, 2.5)
	UI.new("UIPadding", { PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12), PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6), Parent = box })
	box:GetPropertyChangedSignal("Text"):Connect(function()
		onChange(box.Text)
	end)
	return box
end

local function chip(parent: Instance, text: string, on: boolean, color: Color3, x: number, y: number, w: number, cb: () -> ())
	UI.button(parent, { Text = text, Color = if on then color else Color3.fromHex("C9C2E6"), Size = UDim2.fromOffset(w, 36), Position = UDim2.fromOffset(x, y), TextSize = 16, Radius = 14 }, cb)
end

local function sectionTitle(parent: Instance, text: string, y: number)
	UI.text(parent, { Text = text, TextSize = 20, AlignX = L, Size = UDim2.new(1, 0, 0, 26), Position = UDim2.fromOffset(0, y) })
end

local ADMIN_RED = Color3.fromHex("FF4F8B")
onOpen.admin = refreshAdminState

local function sendAi(text: string)
	if adm.waiting or text == "" then
		return
	end
	table.insert(adm.chat, { who = "moi", text = text })
	adm.draft = ""
	adm.waiting = true
	admRerender()
	task.spawn(function()
		local res = adminCall("ai", text)
		adm.waiting = false
		local reply = res.text or ""
		if res.done and #res.done > 0 then
			reply ..= "\n\n✅ " .. table.concat(res.done, "\n✅ ")
		end
		table.insert(adm.chat, { who = "ia", text = reply })
		play(if res.ok then "pop" else "error")
		refreshAdminState()
	end)
end

local function buildAiTab(c: Frame)
	if not adm.hasKey then
		UI.text(c, { Text = "⚠️ Clé API Claude manquante : ajoute le secret « anthropic_api_key » (voir le README). La partie Manuel marche sans.", TextSize = 15, Wrap = true, Color = Color3.fromHex("C2185B"), Size = UDim2.new(1, 0, 0, 40), Position = UDim2.fromOffset(0, 52) })
	end
	local top = if adm.hasKey then 52 else 94
	local sc = scroller(c, UDim2.new(1, 0, 1, -(top + 120)), UDim2.fromOffset(0, top))
	UI.new("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder, Parent = sc })
	UI.new("UIPadding", { PaddingRight = UDim.new(0, 14), Parent = sc })
	if #adm.chat == 0 then
		UI.text(sc, { Text = "Demande-moi ce que tu veux en français : je le fais dans le jeu.", TextSize = 18, Color = UI.MUTED, Size = UDim2.new(1, 0, 0, 30) })
	end
	for i, m in adm.chat do
		local mine = m.who == "moi"
		local row = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = i, Parent = sc })
		local bubble = UI.new("Frame", { BackgroundColor3 = if mine then UI.PINK else UI.WHITE, Size = UDim2.new(0.78, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Position = if mine then UDim2.new(0.22, 0, 0, 0) else UDim2.new(), Parent = row })
		UI.corner(bubble, 16)
		UI.stroke(bubble, 2.5)
		UI.new("UIPadding", { PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12), PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8), Parent = bubble })
		local t = UI.text(bubble, { Text = (if mine then "" else "🤖 ") .. m.text, TextSize = 16, Wrap = true, AlignX = L, Color = if mine then UI.WHITE else UI.INK, Size = UDim2.new(1, 0, 0, 0) })
		t.AutomaticSize = Enum.AutomaticSize.Y
	end
	if adm.waiting then
		UI.text(sc, { Text = "🤖 L'IA réfléchit…", TextSize = 16, AlignX = L, Color = UI.MUTED, Size = UDim2.new(1, 0, 0, 24), LayoutOrder = #adm.chat + 1 })
	end
	task.defer(function()
		sc.CanvasPosition = Vector2.new(0, 1e6)
	end)
	-- suggestions
	local ideas = { "Donne 1M de pièces à tout le monde", "Pluie de pets Mythiques !", "Chance x10 pendant 10 min", "Annonce : boss dans 1 minute" }
	local x = 0
	for _, idea in ideas do
		local w = (utf8.len(idea) or #idea) * 7.6 + 28
		UI.button(c, { Text = idea, Color = UI.LILAC, Size = UDim2.fromOffset(w, 32), Position = UDim2.new(0, x, 1, -108), TextSize = 14, Radius = 14 }, function()
			sendAi(idea)
		end)
		x += w + 8
	end
	local box = textInput(c, { Text = adm.draft, Placeholder = "Ex. : donne un Kraken arc-en-ciel à Noah et lance la gravité lunaire 5 min", Size = UDim2.new(1, -250, 0, 56), Position = UDim2.new(0, 0, 1, -62) }, function(t)
		adm.draft = t
	end)
	box.FocusLost:Connect(function(enter)
		if enter then
			sendAi(adm.draft)
		end
	end)
	UI.button(c, { Text = if adm.waiting then "…" else "Envoyer", Color = UI.GREEN, Size = UDim2.fromOffset(120, 56), Position = UDim2.new(1, -240, 1, -62), TextSize = 20, Enabled = not adm.waiting }, function()
		sendAi(adm.draft)
	end)
	UI.button(c, { Text = "Effacer", Color = Color3.fromHex("9C93C9"), Size = UDim2.fromOffset(108, 56), Position = UDim2.new(1, -108, 1, -62), TextSize = 18 }, function()
		adm.chat = {}
		admRerender()
		task.spawn(adminCall, "aiReset")
	end)
end

local function targetRow(c: Instance, y: number)
	UI.text(c, { Text = "Cible :", TextSize = 18, AlignX = L, Size = UDim2.fromOffset(70, 36), Position = UDim2.fromOffset(0, y) })
	local opts = { { "me", "Moi" }, { "all", "Tout le monde" } }
	for _, p in Players:GetPlayers() do
		if p ~= player then
			table.insert(opts, { p.Name, p.DisplayName })
		end
	end
	local x = 74
	for _, o in opts do
		local w = (utf8.len(o[2]) or #o[2]) * 9 + 30
		chip(c, o[2], adm.target == o[1], UI.PINK, x, y, w, function()
			adm.target = o[1]
			admRerender()
		end)
		x += w + 8
	end
end

local function buildManualTab(c: Frame)
	local sc = scroller(c, UDim2.new(1, 0, 1, -96), UDim2.fromOffset(0, 52))
	local body = UI.new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -16, 0, 640), Parent = sc })
	targetRow(body, 0)
	-- monnaie
	sectionTitle(body, "💰 Pièces et gemmes", 50)
	textInput(body, { Text = adm.amount, Placeholder = "1M, 50k…", Size = UDim2.fromOffset(160, 40), Position = UDim2.fromOffset(0, 80) }, function(t)
		adm.amount = t
	end)
	UI.button(body, { Text = "+ Pièces", Color = UI.YELLOW, Size = UDim2.fromOffset(130, 40), Position = UDim2.fromOffset(172, 80), TextSize = 17 }, function()
		act("give_currency", { player = adm.target, currency = "coins", amount = parseAmount(adm.amount) })
	end)
	UI.button(body, { Text = "+ Gemmes", Color = UI.SKY, Size = UDim2.fromOffset(130, 40), Position = UDim2.fromOffset(312, 80), TextSize = 17 }, function()
		act("give_currency", { player = adm.target, currency = "gems", amount = parseAmount(adm.amount) })
	end)
	UI.button(body, { Text = "− Pièces", Color = UI.RED, Size = UDim2.fromOffset(130, 40), Position = UDim2.fromOffset(452, 80), TextSize = 17 }, function()
		act("give_currency", { player = adm.target, currency = "coins", amount = -parseAmount(adm.amount) })
	end)
	-- pet
	sectionTitle(body, "🐾 Donner un pet", 136)
	local id = Config.PetOrder[adm.pet]
	local def = Config.Pets[id]
	local card = UI.new("Frame", { BackgroundColor3 = UI.lighten(def.body, 0.75), Size = UDim2.fromOffset(150, 150), Position = UDim2.fromOffset(52, 166), Parent = body })
	UI.corner(card, 16)
	UI.stroke(card, 3.5, Config.Rarities[def.rarity].color)
	UI.viewport(card, PetModels.build(id, adm.tier, adm.shiny, 1, false, THUMB), {})
	UI.button(body, { Text = "◀", Color = UI.LILAC, Size = UDim2.fromOffset(42, 60), Position = UDim2.fromOffset(0, 210), TextSize = 22 }, function()
		adm.pet = (adm.pet - 2) % #Config.PetOrder + 1
		admRerender()
	end)
	UI.button(body, { Text = "▶", Color = UI.LILAC, Size = UDim2.fromOffset(42, 60), Position = UDim2.fromOffset(212, 210), TextSize = 22 }, function()
		adm.pet = adm.pet % #Config.PetOrder + 1
		admRerender()
	end)
	UI.text(body, { Text = def.name, TextSize = 20, AlignX = L, Size = UDim2.fromOffset(560, 26), Position = UDim2.fromOffset(270, 168) })
	UI.text(body, { Text = Config.Rarities[def.rarity].name, TextSize = 16, AlignX = L, Color = Config.Rarities[def.rarity].color, Size = UDim2.fromOffset(300, 22), Position = UDim2.fromOffset(270, 194) })
	for i, t in { "Normal", "Doré", "Arc-en-ciel" } do
		chip(body, t, adm.tier == i - 1, UI.YELLOW, 270 + (i - 1) * 128, 224, 120, function()
			adm.tier = i - 1
			admRerender()
		end)
	end
	chip(body, "✨ Shiny", adm.shiny, UI.SKY, 654, 224, 110, function()
		adm.shiny = not adm.shiny
		admRerender()
	end)
	for i, n in { 1, 5, 10 } do
		chip(body, "× " .. n, adm.count == n, UI.MINT, 270 + (i - 1) * 78, 270, 70, function()
			adm.count = n
			admRerender()
		end)
	end
	UI.button(body, { Text = "Donner", Color = UI.GREEN, Size = UDim2.fromOffset(150, 40), Position = UDim2.fromOffset(510, 268), TextSize = 18 }, function()
		act("give_pet", { player = adm.target, pet = id, tier = adm.tier, shiny = adm.shiny, count = adm.count })
	end)
	-- potions et mondes
	sectionTitle(body, "🧪 Potions (10 min)", 334)
	for i, p in Config.Potions do
		UI.button(body, { Text = p.name, Color = p.color, Size = UDim2.fromOffset(240, 40), Position = UDim2.fromOffset((i - 1) * 252, 364), TextSize = 15 }, function()
			act("give_potion", { player = adm.target, potion = p.id, minutes = 10 })
		end)
	end
	sectionTitle(body, "🌍 Téléporter", 420)
	for i, w in Config.Worlds do
		UI.button(body, { Text = w.name, Color = UI.MINT, Size = UDim2.fromOffset(186, 40), Position = UDim2.fromOffset((i - 1) * 196, 450), TextSize = 15 }, function()
			act("teleport", { player = adm.target, world = i })
		end)
	end
	-- boss et modération
	sectionTitle(body, "⚔️ Boss et modération", 506)
	UI.button(body, { Text = "💀 Faire apparaître le boss", Color = UI.ORANGE, Size = UDim2.fromOffset(280, 40), Position = UDim2.fromOffset(0, 536), TextSize = 16 }, function()
		act("spawn_boss", {})
	end)
	UI.button(body, { Text = "Expulser", Color = UI.RED, Size = UDim2.fromOffset(150, 40), Position = UDim2.fromOffset(292, 536), TextSize = 16, Enabled = adm.target ~= "me" and adm.target ~= "all" }, function()
		act("kick", { player = adm.target, reason = "Expulsé par un admin" })
	end)
	UI.button(body, { Text = if adm.confirmReset then "Sûr ? Re-clique" else "Remettre à zéro", Color = Color3.fromHex("8E1B3A"), Size = UDim2.fromOffset(200, 40), Position = UDim2.fromOffset(452, 536), TextSize = 16, Enabled = adm.target ~= "all" }, function()
		if adm.confirmReset then
			adm.confirmReset = false
			act("reset_player", { player = adm.target, confirm = true })
		else
			adm.confirmReset = true
			admRerender()
		end
	end)
	UI.text(c, { Text = adm.result, TextSize = 16, Wrap = true, AlignX = L, Color = Color3.fromHex("2E7D5B"), Size = UDim2.new(1, 0, 0, 36), Position = UDim2.new(0, 0, 1, -38) })
end

local ABUSE_CARDS = {
	{ "coins_x", "🟡", "Pièces x10", Color3.fromHex("FFD54A") },
	{ "luck_x", "🍀", "Chance x10", Color3.fromHex("7EE0B8") },
	{ "damage_x", "💪", "Dégâts x10", Color3.fromHex("FF5A6E") },
	{ "speed_x", "⚡", "Vitesse x2", Color3.fromHex("7FD6FF") },
	{ "coin_rain", "💰", "Pluie de pièces", Color3.fromHex("FFB020") },
	{ "low_gravity", "🌙", "Gravité lunaire", Color3.fromHex("B69CFF") },
	{ "giant", "🦖", "Tout le monde géant", Color3.fromHex("3DD68C") },
	{ "tiny", "🐜", "Tout le monde mini", Color3.fromHex("FF9A3C") },
	{ "disco", "🪩", "Disco", Color3.fromHex("FF8FB8") },
	{ "night", "🌌", "Nuit étoilée", Color3.fromHex("6B5BD6") },
}

local abuseList: { any } = {}
local abuseAt = 0

local function buildAbuseTab(c: Frame)
	UI.text(c, { Text = "Durée :", TextSize = 18, AlignX = L, Size = UDim2.fromOffset(80, 36), Position = UDim2.fromOffset(0, 52) })
	for i, m in { 1, 5, 10, 30 } do
		chip(c, m .. " min", adm.minutes == m, ADMIN_RED, 80 + (i - 1) * 92, 52, 84, function()
			adm.minutes = m
			admRerender()
		end)
	end
	textInput(c, { Text = adm.value, Placeholder = "Valeur (vide = défaut)", Size = UDim2.fromOffset(220, 36), Position = UDim2.fromOffset(460, 52) }, function(t)
		adm.value = t
	end)
	for i, card in ABUSE_CARDS do
		local col, row = (i - 1) % 5, (i - 1) // 5
		local b = UI.button(c, { Text = "", Color = card[4], Size = UDim2.fromOffset(158, 96), Position = UDim2.fromOffset(col * 170, 104 + row * 108), Radius = 20 }, function()
			act("abuse_event", { kind = card[1], value = tonumber(adm.value), minutes = adm.minutes })
		end)
		UI.text(b.frame, { Text = card[2], TextSize = 34, Size = UDim2.new(1, 0, 0, 50), Position = UDim2.fromOffset(0, 4) })
		UI.text(b.frame, { Text = card[3], TextSize = 15, Color = UI.WHITE, Outline = 2, Wrap = true, Size = UDim2.new(1, -10, 0, 36), Position = UDim2.fromOffset(5, 54) })
	end
	-- pluie de pets
	UI.text(c, { Text = "🎁 Pluie de pets :", TextSize = 18, AlignX = L, Size = UDim2.fromOffset(170, 36), Position = UDim2.fromOffset(0, 330) })
	for r = 1, 7 do
		chip(c, Config.Rarities[r].name, adm.rarity == r, Config.Rarities[r].color, 170 + (r - 1) * 96, 330, 90, function()
			adm.rarity = r
			admRerender()
		end)
	end
	UI.button(c, { Text = "🎁 Lancer la pluie de pets", Color = ADMIN_RED, Size = UDim2.fromOffset(300, 46), Position = UDim2.fromOffset(0, 378), TextSize = 18 }, function()
		act("pet_rain", { rarity = adm.rarity })
	end)
	UI.button(c, { Text = "⛔ Tout arrêter", Color = Color3.fromHex("5A4A7A"), Size = UDim2.fromOffset(200, 46), Position = UDim2.fromOffset(312, 378), TextSize = 18 }, function()
		act("stop_events", {})
	end)
	local lines = {}
	for _, e in abuseList do
		table.insert(lines, e.icon .. " " .. e.label)
	end
	UI.text(c, { Text = if #lines > 0 then "En cours : " .. table.concat(lines, " · ") else "Aucun événement en cours", TextSize = 16, Wrap = true, AlignX = L, Size = UDim2.new(1, 0, 0, 30), Position = UDim2.new(0, 0, 1, -70) })
	UI.text(c, { Text = adm.result, TextSize = 16, Wrap = true, AlignX = L, Color = Color3.fromHex("2E7D5B"), Size = UDim2.new(1, 0, 0, 30), Position = UDim2.new(0, 0, 1, -36) })
end

local function buildAnnounceTab(c: Frame)
	textInput(c, { Text = adm.ann, Placeholder = "Ton message (en français) : chaque joueur le reçoit dans sa langue", Multi = true, Size = UDim2.new(1, 0, 0, 110), Position = UDim2.fromOffset(0, 52) }, function(t)
		adm.ann = t
	end)
	chip(c, if adm.translate then "🌍 Traduire : OUI" else "🌍 Traduire : NON", adm.translate, UI.GREEN, 0, 174, 200, function()
		adm.translate = not adm.translate
		admRerender()
	end)
	UI.button(c, { Text = "📢 Envoyer l'annonce", Color = ADMIN_RED, Size = UDim2.fromOffset(240, 40), Position = UDim2.fromOffset(212, 172), TextSize = 18 }, function()
		if adm.ann ~= "" then
			act("announce", { message = adm.ann, translate = adm.translate })
			adm.ann = ""
		end
	end)
	UI.text(c, { Text = adm.result, TextSize = 15, Wrap = true, AlignX = L, Color = Color3.fromHex("2E7D5B"), Size = UDim2.new(1, -470, 0, 40), Position = UDim2.fromOffset(466, 172) })
	UI.text(c, { Text = "Les messages des joueurs dans le chat sont traduits automatiquement par Roblox. Tes annonces s'affichent en grand et dans le chat, dans la langue de chacun.", TextSize = 14, Wrap = true, AlignX = L, Color = UI.MUTED, Size = UDim2.new(1, 0, 0, 36), Position = UDim2.fromOffset(0, 220) })
	sectionTitle(c, "📜 Journal des actions", 262)
	local sc = scroller(c, UDim2.new(1, 0, 1, -296), UDim2.fromOffset(0, 294))
	UI.new("UIListLayout", { Padding = UDim.new(0, 4), Parent = sc })
	for _, line in adm.log do
		UI.text(sc, { Text = line, TextSize = 14, Wrap = true, AlignX = L, Size = UDim2.new(1, -14, 0, 20) })
	end
end

panels.admin = {
	title = "Admin",
	color = ADMIN_RED,
	w = 900,
	h = 600,
	sig = function()
		return tostring(adm.rev)
	end,
	build = function(c)
		tabs(c, { "🤖 Assistant IA", "🛠️ Manuel", "🔥 Admin abusé", "📢 Annonces" }, ADMIN_RED)
		if current.tab == 1 then
			buildAiTab(c)
		elseif current.tab == 2 then
			buildManualTab(c)
		elseif current.tab == 3 then
			buildAbuseTab(c)
		else
			buildAnnounceTab(c)
		end
	end,
}

-- bouton du menu, seulement pour les admins
local adminBtn = menuButton(UDim.new(1, -76), 510, "admin", "🛡️", "Admin (K)", ADMIN_RED)
adminBtn.Visible = player:GetAttribute("IsAdmin") == true
player:GetAttributeChangedSignal("IsAdmin"):Connect(function()
	adminBtn.Visible = player:GetAttribute("IsAdmin") == true
end)

-- bannières : annonce et événements en cours
local annBanner = UI.box(hud, { Size = UDim2.fromOffset(640, 92), Position = UDim2.new(0.5, 0, 0, 236), AnchorPoint = Vector2.new(0.5, 0), Color = UI.WHITE, Radius = 24 })
local annHolder = annBanner.Parent :: Frame
annHolder.Visible = false
annHolder.ZIndex = 4
local annFrom = UI.text(annBanner, { Text = "", TextSize = 16, Color = ADMIN_RED, Size = UDim2.new(1, -24, 0, 22), Position = UDim2.fromOffset(12, 6) })
local annText = UI.text(annBanner, { Text = "", TextSize = 22, Wrap = true, Size = UDim2.new(1, -24, 0, 56), Position = UDim2.fromOffset(12, 28) })
local annToken = 0

local abuseBanner = UI.box(hud, { Size = UDim2.fromOffset(360, 40), Position = UDim2.new(0.5, 0, 0, 184), AnchorPoint = Vector2.new(0.5, 0), Color = ADMIN_RED, Radius = 18 })
local abuseHolder = abuseBanner.Parent :: Frame
abuseHolder.Visible = false
local abuseText = UI.text(abuseBanner, { Text = "", TextSize = 17, Color = UI.WHITE, Outline = 2, Size = UDim2.new(1, -16, 1, 0), Position = UDim2.fromOffset(8, 0) })

local disco = UI.new("ColorCorrectionEffect", { Name = "AdminDisco", Enabled = false, Parent = Lighting })

local function chatSystem(text: string)
	local channels = TextChatService:FindFirstChild("TextChannels")
	local general = channels and channels:FindFirstChild("RBXGeneral") :: TextChannel?
	if general then
		pcall(general.DisplaySystemMessage, general, text)
	end
end

Fx.OnClientEvent:Connect(function(kind: string, data: any)
	if kind == "announce" then
		annFrom.Text = "📢 Annonce de " .. tostring(data.from)
		annText.Text = tostring(data.text)
		annHolder.Visible = true
		annToken += 1
		local token = annToken
		play("legend")
		chatSystem("📢 [" .. tostring(data.from) .. "] " .. tostring(data.text))
		task.delay(8, function()
			if annToken == token then
				annHolder.Visible = false
			end
		end)
	elseif kind == "abuse" then
		abuseList = data.list or {}
		abuseAt = os.clock()
		if current.name == "admin" then
			admRerender()
		end
	elseif kind == "coinRain" then
		local root = hrp()
		if root then
			for _ = 1, 8 do
				local start = root.Position + Vector3.new(math.random(-30, 30), 40 + math.random() * 10, math.random(-30, 30))
				local coin = UI.new("Part", { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.4, 2, 2), Color = Color3.fromHex("FFD54A"), Material = Enum.Material.Neon, Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, CFrame = CFrame.new(start) * CFrame.Angles(0, 0, math.rad(90)), Parent = fxFolder })
				TweenService:Create(coin, TweenInfo.new(1.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { CFrame = CFrame.new(start - Vector3.new(0, 44, 0)) * CFrame.Angles(math.rad(360), 0, math.rad(90)) }):Play()
				Debris:AddItem(coin, 1.5)
			end
		end
	end
end)

-- mise à jour des bannières et de l'effet disco
RunService.Heartbeat:Connect(function()
	local lines = {}
	local discoOn = false
	for _, e in abuseList do
		local left = math.max(0, e.left - (os.clock() - abuseAt))
		if left > 0 then
			table.insert(lines, string.format("%s %s %d:%02d", e.icon, e.label, left // 60, left % 60))
			if e.kind == "disco" then
				discoOn = true
			end
		end
	end
	abuseHolder.Visible = #lines > 0
	if #lines > 0 then
		abuseText.Text = "🔥 ADMIN ABUSE · " .. table.concat(lines, "  ")
		abuseHolder.Size = UDim2.fromOffset(math.min(900, 160 + #lines * 190), 40)
	end
	disco.Enabled = discoOn
	if discoOn then
		disco.TintColor = Color3.fromHSV((os.clock() * 0.6) % 1, 0.45, 1)
		disco.Saturation = 0.4
	end
end)

---------------------------------------------------------------------------
-- Raccourcis clavier
---------------------------------------------------------------------------
local keys = {
	[Enum.KeyCode.P] = "pets",
	[Enum.KeyCode.I] = "index",
	[Enum.KeyCode.B] = "shop",
	[Enum.KeyCode.J] = "quests",
	[Enum.KeyCode.C] = "worlds",
	[Enum.KeyCode.G] = "gift",
	[Enum.KeyCode.R] = "rebirth",
	[Enum.KeyCode.K] = "admin",
}
UserInputService.InputBegan:Connect(function(input, processed)
	if processed or not S then
		return
	end
	local p = keys[input.KeyCode]
	if p == "admin" and player:GetAttribute("IsAdmin") ~= true then
		p = nil
	end
	if p then
		if current.name == p then
			closePanel()
		else
			openPanel(p)
		end
	elseif input.KeyCode == Enum.KeyCode.F then
		send("autoCollect", not S.autoCollect)
	end
end)

---------------------------------------------------------------------------
-- Boucle d'affichage
---------------------------------------------------------------------------
local slowT = 0
RunService.RenderStepped:Connect(function(dt)
	updatePets(dt)

	-- rayons qui tournent derrière un pet mythique ou divin
	if hatchState.open then
		for _, ch in hatchHost:GetChildren() do
			if ch:GetAttribute("Spin") then
				(ch :: Frame).Rotation += dt * 25
			end
		end
	end

	-- pets rares révélés : ils jouent leur animation d'attaque
	for _, h in hatchState.anims do
		PetModels.pose(h.anim, h.pivot, "ability", os.clock(), dt)
	end

	-- œufs qui oscillent pendant l'éclosion
	if hatchState.open and not hatchState.revealed then
		local k = math.clamp(os.clock() - hatchState.t0, 0, 1)
		for i, m in hatchState.eggs do
			m:PivotTo(CFrame.Angles(0, 0, math.sin(os.clock() * 28 + i) * 0.35 * k))
		end
	end

	-- gains regroupés en un seul « +X »
	pickupT -= dt
	if pickup > 0 and pickupT <= 0 then
		local root = hrp()
		if root then
			floatText(root.Position + Vector3.new(math.random() * 2 - 1, 4, 0), "+" .. fmt(pickup), UI.YELLOW, 26)
		end
		pickup = 0
		pickupT = 0.4
	end

	slowT -= dt
	if slowT > 0 then
		return
	end
	slowT = 0.25
	-- boss
	local state = workspace:GetAttribute("BossState")
	local btime = (workspace:GetAttribute("BossTime") :: number?) or 0
	local inBoss = player:GetAttribute("InBoss") == true
	local fighting = inBoss and state == "open"
	bossBtn.holder.Visible = state == "open" and not inBoss
	bossBtn:set("COMBATTRE LE GOLEM · " .. Config.fmtTime(btime))
	bossHudHolder.Visible = fighting
	bossTipHolder.Visible = fighting
	bannerHolder.Visible = not fighting
	if fighting then
		local hp = (workspace:GetAttribute("BossHP") :: number?) or 0
		local mx = math.max((workspace:GetAttribute("BossMax") :: number?) or 1, 1)
		bossHpSet(hp / mx)
		bossHpText.Text = fmt(hp) .. " / " .. fmt(mx) .. " · " .. Config.fmtTime(btime)
	end
	timerChips.boss.Visible = state ~= "open"
	timerLabels.boss.Text = "Boss dans " .. Config.fmtTime(btime)

	-- auto-éclosion
	nearEgg = nil
	local root = hrp()
	if root then
		for id, stand in eggStands do
			if (stand.Position - root.Position).Magnitude < 20 then
				nearEgg = id
			end
		end
	end
	local showAuto = S ~= nil and S.passes.auto == true and nearEgg ~= nil and not inBoss
	autoHatchBtn.holder.Visible = showAuto
	if showAuto then
		local on = S.autoHatch == nearEgg
		autoHatchBtn:set(if on then "Auto-éclosion : OUI" else "Auto-éclosion : NON")
		autoHatchBtn:recolor(if on then UI.GREEN else UI.LILAC)
	end
	hintHolder.Position = if showAuto then UDim2.new(0.5, 0, 1, -184) else UDim2.new(0.5, 0, 1, -130)
end)
