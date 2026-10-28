-- Steal a Sweet Egg : serveur
-- Un tapis roulant fait défiler des œufs au milieu de la map. Achète-les, ils
-- éclosent dans ta base et tes pets rapportent de l'argent chaque seconde.
-- Les autres joueurs peuvent entrer dans ta base et voler tes œufs et tes pets :
-- verrouille ta base, et frappe les voleurs avec ta batte pour qu'ils lâchent tout.
-- Le serveur décide de tout ; les joueurs n'envoient que des demandes.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local DataStoreService = game:GetService("DataStoreService")
local MarketplaceService = game:GetService("MarketplaceService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local PetModels = require(Shared:WaitForChild("PetModels"))

local rng = Random.new()
local fmt = Config.fmt
local function now(): number
	return workspace:GetServerTimeNow()
end

-- Modèles Blender importés dans Studio (pet_<id>) : rangés dans ReplicatedStorage › PetMeshes
do
	local meshes = ReplicatedStorage:FindFirstChild("PetMeshes")
	if not meshes then
		meshes = Instance.new("Folder")
		meshes.Name = "PetMeshes"
		meshes.Parent = ReplicatedStorage
	end
	for _, d in workspace:GetDescendants() do
		if d:IsA("Model") and string.sub(d.Name, 1, 4) == "pet_" and not (d.Parent and d.Parent.Name == d.Name) then
			d.Parent = meshes
		end
	end
end

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
	if props.CanCollide == nil then
		props.CanCollide = false
	end
	props.CanQuery = false
	props.CanTouch = false
	return part(props)
end

local INK = Color3.fromHex("3B2A5A")

local function billboard(adornee: BasePart, offset: Vector3, size: UDim2, maxDist: number?): BillboardGui
	local bb = Instance.new("BillboardGui")
	bb.Adornee = adornee
	bb.StudsOffsetWorldSpace = offset
	bb.Size = size
	bb.AlwaysOnTop = false
	bb.LightInfluence = 0
	bb.MaxDistance = maxDist or 120
	bb.Parent = adornee
	return bb
end

local function label(parent: Instance, text: string, size: UDim2, pos: UDim2, color: Color3?): TextLabel
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Size = size
	t.Position = pos
	t.Font = Enum.Font.FredokaOne
	t.TextScaled = true
	t.Text = text
	t.TextColor3 = color or Color3.new(1, 1, 1)
	local st = Instance.new("UIStroke")
	st.Thickness = 2.5
	st.Color = INK
	st.Parent = t
	t.Parent = parent
	return t
end

---------------------------------------------------------------------------
-- Map : un tapis rouge au centre, 4 bases de chaque côté
---------------------------------------------------------------------------
local map = Instance.new("Folder")
map.Name = "Map"
map.Parent = workspace
local plotFolder = Instance.new("Folder")
plotFolder.Name = "Plots"
plotFolder.Parent = workspace
local eggFolder = Instance.new("Folder")
eggFolder.Name = "ConveyorEggs"
eggFolder.Parent = workspace

local CARPET_HALF = 14
local CARPET_Z = 265
local PLOT_DEPTH, PLOT_HALF_W = 84, 50
local INNER = 30 -- distance du centre au bord intérieur d'une base

part({ Parent = map, Name = "Ground", Size = Vector3.new(760, 2, 720), Position = Vector3.new(0, -1, 0), Color = Color3.fromHex("FFC6DD"), Material = Enum.Material.Grass })
-- tapis rouge et bordures dorées
part({ Parent = map, Name = "Carpet", Size = Vector3.new(CARPET_HALF * 2, 0.4, CARPET_Z * 2), Position = Vector3.new(0, 0.2, 0), Color = Color3.fromHex("D62E4B"), Material = Enum.Material.Fabric })
for _, sx in { -1, 1 } do
	deco({ Parent = map, Size = Vector3.new(1.6, 0.8, CARPET_Z * 2), Position = Vector3.new(sx * (CARPET_HALF + 0.8), 0.4, 0), Color = Color3.fromHex("FFD54A"), Material = Enum.Material.Neon, CanCollide = true })
end
-- flèches lumineuses qui montrent le sens du tapis
for z = -240, 240, 40 do
	deco({ Parent = map, Size = Vector3.new(8, 0.1, 2), CFrame = CFrame.new(-3, 0.45, z) * CFrame.Angles(0, math.rad(35), 0), Color = Color3.fromHex("FF8FA8"), Material = Enum.Material.Neon })
	deco({ Parent = map, Size = Vector3.new(8, 0.1, 2), CFrame = CFrame.new(3, 0.45, z) * CFrame.Angles(0, math.rad(-35), 0), Color = Color3.fromHex("FF8FA8"), Material = Enum.Material.Neon })
end
-- machines aux deux bouts du tapis : l'usine qui pond les œufs et la broyeuse
local function machine(z: number, title: string, color: string)
	local c = Color3.fromHex(color)
	for _, sx in { -1, 1 } do
		part({ Parent = map, Size = Vector3.new(6, 26, 10), Position = Vector3.new(sx * 18, 13, z), Color = c })
		deco({ Parent = map, Size = Vector3.new(6.5, 2, 10.5), Position = Vector3.new(sx * 18, 26, z), Color = Color3.fromHex("FFD54A") })
	end
	local top = part({ Parent = map, Size = Vector3.new(42, 10, 12), Position = Vector3.new(0, 31, z), Color = c })
	deco({ Parent = map, Size = Vector3.new(30, 18, 0.4), Position = Vector3.new(0, 9, z), Color = Color3.fromHex("2A1E44"), Transparency = 0.35 })
	for i = -2, 2 do
		deco({ Parent = map, Size = Vector3.one * 3, Position = Vector3.new(i * 7, 37, z), Shape = Enum.PartType.Ball, Color = Color3.fromHSV((i + 2) / 5, 0.5, 1), Material = Enum.Material.Neon })
	end
	local sg = Instance.new("SurfaceGui")
	sg.Face = if z > 0 then Enum.NormalId.Back else Enum.NormalId.Front
	sg.CanvasSize = Vector2.new(840, 200)
	sg.LightInfluence = 0
	sg.Parent = top
	label(sg, title, UDim2.fromScale(1, 1), UDim2.new())
end
machine(CARPET_Z + 4, "🥚 USINE À ŒUFS", "FF8FB8")
machine(-CARPET_Z - 4, "BROYEUSE 😈", "6B5BD6")

-- décor sucré autour de la map
do
	local dr = Random.new(77)
	local cols = { "FF5A8A", "FFD54A", "7EE0B8", "7FD6FF", "B69CFF", "FF9A3C" }
	local function lollipop(x: number, z: number, h: number)
		local c = Color3.fromHex(cols[dr:NextInteger(1, #cols)])
		deco({ Parent = map, Size = Vector3.new(h, 1, 1), CFrame = CFrame.new(x, h / 2, z) * CFrame.Angles(0, 0, math.rad(90)), Shape = Enum.PartType.Cylinder, Color = Color3.new(1, 1, 1), CanCollide = true })
		deco({ Parent = map, Size = Vector3.new(1.6, h * 0.55, h * 0.55), CFrame = CFrame.new(x, h, z) * CFrame.Angles(0, dr:NextNumber(0, math.pi), 0), Shape = Enum.PartType.Cylinder, Color = c, CanCollide = true })
		deco({ Parent = map, Size = Vector3.new(1.8, h * 0.3, h * 0.3), CFrame = CFrame.new(x, h, z) * CFrame.Angles(0, dr:NextNumber(0, math.pi), 0), Shape = Enum.PartType.Cylinder, Color = Color3.new(1, 1, 1) })
	end
	local function gumdrop(x: number, z: number, s: number)
		local c = Color3.fromHex(cols[dr:NextInteger(1, #cols)])
		deco({ Parent = map, Size = Vector3.new(s * 1.3, s, s * 1.3), Position = Vector3.new(x, s * 0.3, z), Shape = Enum.PartType.Ball, Color = c, Material = Enum.Material.Glass, Transparency = 0.1, CanCollide = true })
	end
	local function cane(x: number, z: number, h: number)
		for i = 0, math.floor(h / 2) do
			deco({ Parent = map, Size = Vector3.new(2.2, 1.6, 1.6), CFrame = CFrame.new(x, 1 + i * 2, z) * CFrame.Angles(0, 0, math.rad(90)), Shape = Enum.PartType.Cylinder, Color = if i % 2 == 0 then Color3.fromHex("E8344E") else Color3.new(1, 1, 1), CanCollide = true })
		end
	end
	for _ = 1, 140 do
		local x, z = dr:NextNumber(-370, 370), dr:NextNumber(-350, 350)
		local inside = math.abs(x) < INNER + PLOT_DEPTH + 8 and math.abs(z) < 290
		if not inside then
			local k = dr:NextNumber()
			if k < 0.4 then
				lollipop(x, z, dr:NextNumber(10, 22))
			elseif k < 0.75 then
				gumdrop(x, z, dr:NextNumber(5, 12))
			else
				cane(x, z, dr:NextNumber(8, 16))
			end
		end
	end
	-- nuages
	for _ = 1, 26 do
		local p = Vector3.new(dr:NextNumber(-380, 380), dr:NextNumber(70, 120), dr:NextNumber(-380, 380))
		for k = 1, 4 do
			deco({ Parent = map, Size = Vector3.one * dr:NextNumber(14, 24), Position = p + Vector3.new(k * 9 - 20, dr:NextNumber(-3, 3), dr:NextNumber(-5, 5)), Shape = Enum.PartType.Ball, Color = Color3.new(1, 1, 1), Material = Enum.Material.SmoothPlastic })
		end
	end
	-- barrières invisibles au bord de la map
	for _, b in { { Vector3.new(0, 30, 362), Vector3.new(760, 60, 4) }, { Vector3.new(0, 30, -362), Vector3.new(760, 60, 4) }, { Vector3.new(382, 30, 0), Vector3.new(4, 60, 720) }, { Vector3.new(-382, 30, 0), Vector3.new(4, 60, 720) } } do
		part({ Parent = map, Size = b[2], Position = b[1], Transparency = 1 })
	end
end

---------------------------------------------------------------------------
-- Bases
---------------------------------------------------------------------------
type Item = {
	kind: string, -- "egg" | "pet"
	rarity: number,
	hatchEnd: number?,
	def: string?,
	tier: number?,
	shiny: boolean?,
	cash: number?,
	stolen: boolean?,
	lucky: boolean?,
}

type Plot = {
	index: number,
	side: number,
	cz: number,
	model: Folder,
	pedestals: { Part },
	steal: { ProximityPrompt },
	sell: { ProximityPrompt },
	lasers: { Part },
	sign: TextLabel,
	timer: TextLabel,
	owner: Player?,
	lockUntil: number,
	reserved: { [number]: boolean },
}

local plots: { Plot } = {}

local function plotPoint(pl: Plot, u: number, w: number, y: number): Vector3
	return Vector3.new(pl.side * (INNER + u), y, pl.cz + w)
end

local function slotUW(i: number): (number, number)
	local col = (i - 1) // 5
	local row = (i - 1) % 5
	return 14 + col * 15, -36 + row * 18
end

local function insidePlot(pl: Plot, pos: Vector3): boolean
	local u = pos.X * pl.side - INNER
	return u > -1 and u < PLOT_DEPTH + 2 and math.abs(pos.Z - pl.cz) < PLOT_HALF_W + 2 and pos.Y < 60
end

local PLOT_COLORS = { "FF8FB8", "7FD6FF", "7EE0B8", "FFD54A", "B69CFF", "FF9A3C", "FF5A6E", "8C7BFF" }

local touchHandlers: { (Plot, Player, string, number) -> () } = {}
local function onTouch(pl: Plot, kind: string, i: number)
	return function(hit: BasePart)
		local char = hit.Parent
		local plr = char and Players:GetPlayerFromCharacter(char)
		if plr and touchHandlers[1] then
			touchHandlers[1](pl, plr, kind, i)
		end
	end
end

local stealPromptHandler: (Player, Plot, number) -> () = function() end
local sellPromptHandler: (Player, Plot, number) -> () = function() end

for i = 1, Config.MAX_PLAYERS do
	local side = if i <= 4 then -1 else 1
	local row = (i - 1) % 4
	local folder = Instance.new("Folder")
	folder.Name = "Plot" .. i
	folder.Parent = plotFolder
	local pl: Plot = {
		index = i,
		side = side,
		cz = -165 + row * 110,
		model = folder,
		pedestals = {},
		steal = {},
		sell = {},
		lasers = {},
		sign = nil :: any,
		timer = nil :: any,
		owner = nil,
		lockUntil = 0,
		reserved = {},
	}
	plots[i] = pl
	local color = Color3.fromHex(PLOT_COLORS[i])
	folder:SetAttribute("Index", i)
	folder:SetAttribute("Owner", 0)
	folder:SetAttribute("LockUntil", 0)

	part({ Parent = folder, Name = "Floor", Size = Vector3.new(PLOT_DEPTH, 0.6, PLOT_HALF_W * 2), Position = plotPoint(pl, PLOT_DEPTH / 2, 0, 0.3), Color = color:Lerp(Color3.new(1, 1, 1), 0.55) })
	-- damier
	for a = 0, 5 do
		for b = 0, 6 do
			if (a + b) % 2 == 0 then
				deco({ Parent = folder, Size = Vector3.new(14, 0.05, 14.2), Position = plotPoint(pl, 7 + a * 14, -42.6 + b * 14.2, 0.62), Color = color:Lerp(Color3.new(1, 1, 1), 0.35) })
			end
		end
	end
	-- murs : fond et côtés (l'entrée est face au tapis)
	part({ Parent = folder, Size = Vector3.new(2, 14, PLOT_HALF_W * 2 + 2), Position = plotPoint(pl, PLOT_DEPTH + 1, 0, 7), Color = color })
	for _, sw in { -1, 1 } do
		part({ Parent = folder, Size = Vector3.new(PLOT_DEPTH, 14, 2), Position = plotPoint(pl, PLOT_DEPTH / 2, sw * (PLOT_HALF_W + 1), 7), Color = color })
		deco({ Parent = folder, Size = Vector3.new(PLOT_DEPTH + 2, 1.2, 2.6), Position = plotPoint(pl, PLOT_DEPTH / 2, sw * (PLOT_HALF_W + 1), 14.4), Color = Color3.new(1, 1, 1) })
		-- piliers de l'entrée
		part({ Parent = folder, Size = Vector3.new(3, 18, 3), Position = plotPoint(pl, 0, sw * (PLOT_HALF_W + 1), 9), Color = Color3.new(1, 1, 1) })
		deco({ Parent = folder, Size = Vector3.one * 4, Position = plotPoint(pl, 0, sw * (PLOT_HALF_W + 1), 19), Shape = Enum.PartType.Ball, Color = color, Material = Enum.Material.Neon })
	end
	-- lasers de l'entrée (visibles quand la base est verrouillée)
	for k = 1, 6 do
		local l = deco({ Parent = folder, Name = "Laser", Size = Vector3.new(0.4, 0.4, PLOT_HALF_W * 2), Position = plotPoint(pl, 0, 0, k * 2.6), Color = Color3.fromHex("FF2A4A"), Material = Enum.Material.Neon, Transparency = 1 })
		table.insert(pl.lasers, l)
	end
	-- panneau avec le nom du propriétaire et le minuteur du verrou
	local signPart = deco({ Parent = folder, Name = "Sign", Size = Vector3.new(1, 1, 1), Position = plotPoint(pl, 0, 0, 22), Transparency = 1 })
	local bb = billboard(signPart, Vector3.zero, UDim2.fromOffset(420, 110), 260)
	pl.sign = label(bb, "Base libre", UDim2.new(1, 0, 0.6, 0), UDim2.new(), Color3.fromHex("FFF6E6"))
	pl.timer = label(bb, "", UDim2.new(1, 0, 0.4, 0), UDim2.fromScale(0, 0.6), Color3.fromHex("FF5A6E"))

	-- bouton du verrou au fond de la base
	local lockPad = part({ Parent = folder, Name = "LockPad", Size = Vector3.new(8, 0.6, 8), Position = plotPoint(pl, 76, 0, 0.9), Color = Color3.fromHex("FF5A6E"), Material = Enum.Material.Neon })
	local lbb = billboard(lockPad, Vector3.new(0, 4, 0), UDim2.fromOffset(200, 50), 80)
	label(lbb, "🔒 VERROUILLER", UDim2.fromScale(1, 1), UDim2.new())
	lockPad.Touched:Connect(onTouch(pl, "lock", 0))

	-- 20 socles (ouverts selon l'agrandissement de la base)
	for s = 1, 20 do
		local u, w = slotUW(s)
		local ped = part({ Parent = folder, Name = "Pedestal", Size = Vector3.new(8, 1.4, 8), Position = plotPoint(pl, u, w, 1.3), Color = Color3.new(1, 1, 1) })
		deco({ Parent = folder, Size = Vector3.new(8.6, 0.4, 8.6), Position = plotPoint(pl, u, w, 0.8), Color = color })
		ped:SetAttribute("Plot", i)
		ped:SetAttribute("Slot", s)
		ped:SetAttribute("Kind", "")
		pl.pedestals[s] = ped
		local plate = part({ Parent = folder, Name = "Collect", Size = Vector3.new(2.6, 0.3, 6.5), Position = plotPoint(pl, u - 5.8, w, 0.75), Color = Color3.fromHex("3DD68C"), Material = Enum.Material.Neon })
		plate.Touched:Connect(onTouch(pl, "collect", s))
		local st = Instance.new("ProximityPrompt")
		st.ActionText = "Voler"
		st.ObjectText = ""
		st.HoldDuration = 1.2
		st.MaxActivationDistance = 10
		st.RequiresLineOfSight = false
		st.KeyboardKeyCode = Enum.KeyCode.E
		st:SetAttribute("Kind", "steal")
		st.Parent = ped
		st.Triggered:Connect(function(plr)
			stealPromptHandler(plr, pl, s)
		end)
		pl.steal[s] = st
		local se = Instance.new("ProximityPrompt")
		se.ActionText = "Vendre"
		se.ObjectText = ""
		se.HoldDuration = 1
		se.MaxActivationDistance = 10
		se.RequiresLineOfSight = false
		se.KeyboardKeyCode = Enum.KeyCode.F
		se.UIOffset = Vector2.new(0, 70)
		se:SetAttribute("Kind", "sell")
		se.Parent = ped
		se.Triggered:Connect(function(plr)
			sellPromptHandler(plr, pl, s)
		end)
		pl.sell[s] = se
	end
end

local function plotSpawn(pl: Plot): CFrame
	local p = plotPoint(pl, 70, 0, 4)
	return CFrame.lookAt(p, Vector3.new(0, 4, pl.cz))
end

---------------------------------------------------------------------------
-- Données des joueurs
---------------------------------------------------------------------------
type Data = {
	cash: number,
	rebirths: number,
	level: number,
	slots: { [string]: any }, -- clé = numéro du socle (texte, pour la sauvegarde)
	pending: { number }, -- œufs achetés en Robux qui attendent une place
	index: { [string]: boolean },
	receipts: { string },
	stolen: number,
}

type Carry = { plot: Plot, slot: number, item: Item, t: number, warned: boolean }

type Profile = {
	data: Data,
	plot: Plot,
	passes: { [string]: boolean },
	carry: Carry?,
	stunUntil: number,
	lastBat: number,
	dirty: boolean,
	loaded: boolean,
	touchCd: { [string]: number },
}

local profiles: { [Player]: Profile } = {}
local store: DataStore? = nil
pcall(function()
	store = DataStoreService:GetDataStore("StealASweetEgg_v1")
end)

local luckUntil = 0

local function defaultData(): Data
	return { cash = Config.START_CASH, rebirths = 0, level = 1, slots = {}, pending = {}, index = {}, receipts = {}, stolen = 0 }
end

local function openSlots(prof: Profile): number
	return Config.SLOT_LEVELS[prof.data.level] or 10
end

local function cashMult(prof: Profile): number
	return Config.rebirthMult(prof.data.rebirths) * (if prof.passes.vip then 2 else 1)
end

local function itemOf(prof: Profile, s: number): Item?
	return prof.data.slots[tostring(s)]
end

local function incomeOf(prof: Profile): number
	local total = 0
	for _, it in prof.data.slots do
		if it.kind == "pet" and not it.stolen then
			total += Config.petIncome(it.def, it.tier or 0, it.shiny == true)
		end
	end
	return total * cashMult(prof)
end

local function sendState(plr: Player)
	local prof = profiles[plr]
	if not prof then
		return
	end
	local d = prof.data
	local found = {}
	for id in d.index do
		table.insert(found, id)
	end
	StateEvent:FireClient(plr, {
		cash = d.cash,
		income = incomeOf(prof),
		rebirths = d.rebirths,
		level = d.level,
		index = found,
		passes = prof.passes,
		plot = prof.plot.index,
		mult = cashMult(prof),
		stolen = d.stolen,
	})
	local ls = plr:FindFirstChild("leaderstats")
	if ls then
		(ls:FindFirstChild("Argent") :: StringValue).Value = "$" .. fmt(d.cash);
		(ls:FindFirstChild("Rebirths") :: IntValue).Value = d.rebirths
	end
end

local function toast(plr: Player, text: string, color: string?)
	Fx:FireClient(plr, "toast", { text = text, color = color })
end

-- recopie l'état d'un socle dans ses attributs (le joueur dessine les modèles)
local function syncSlot(pl: Plot, s: number)
	local ped = pl.pedestals[s]
	local prof = if pl.owner then profiles[pl.owner] else nil
	local open = prof ~= nil and s <= openSlots(prof)
	local it = if prof then itemOf(prof, s) else nil
	ped.Transparency = if open then 0 else 0.75
	ped:SetAttribute("Open", open)
	ped:SetAttribute("Owner", if pl.owner then pl.owner.UserId else 0)
	ped:SetAttribute("Kind", if it then it.kind else "")
	ped:SetAttribute("Rarity", if it then it.rarity else 0)
	ped:SetAttribute("HatchEnd", if it and it.hatchEnd then it.hatchEnd else 0)
	ped:SetAttribute("Def", if it and it.def then it.def else "")
	ped:SetAttribute("Tier", if it and it.tier then it.tier else 0)
	ped:SetAttribute("Shiny", if it and it.shiny then true else false)
	ped:SetAttribute("Stolen", if it and it.stolen then true else false)
	ped:SetAttribute("Cash", if it and it.cash then math.floor(it.cash) else 0)
	ped:SetAttribute("Income", if it and it.kind == "pet" and prof then Config.petIncome(it.def :: string, it.tier or 0, it.shiny == true) * cashMult(prof) else 0)
	local name = ""
	if it then
		name = if it.kind == "pet" then Config.Pets[it.def :: string].name else Config.eggOf(it.rarity).name
	end
	pl.steal[s].ObjectText = name
	if it and it.kind == "pet" and prof then
		pl.sell[s].ObjectText = name .. " · $" .. fmt(Config.sellPrice(it.def :: string, it.tier or 0, it.shiny == true) * cashMult(prof))
	else
		pl.sell[s].ObjectText = name
	end
end

local function syncPlot(pl: Plot)
	for s = 1, 20 do
		syncSlot(pl, s)
	end
	local owner = pl.owner
	pl.sign.Text = if owner then "Base de " .. owner.DisplayName else "Base libre"
	pl.model:SetAttribute("Owner", if owner then owner.UserId else 0)
end

local function freeSlot(prof: Profile): number?
	for s = 1, openSlots(prof) do
		if not itemOf(prof, s) and not prof.plot.reserved[s] then
			return s
		end
	end
	return nil
end

local function addCash(prof: Profile, v: number)
	prof.data.cash += v
	prof.dirty = true
end

local function spend(plr: Player, prof: Profile, cost: number): boolean
	if prof.data.cash < cost then
		toast(plr, "Pas assez d'argent !", "FF5A6E")
		Fx:FireClient(plr, "error", {})
		return false
	end
	prof.data.cash -= cost
	prof.dirty = true
	return true
end

local function placeEgg(prof: Profile, s: number, rarity: number, hatchLeft: number?, lucky: boolean?)
	local egg = Config.eggOf(rarity)
	local t = hatchLeft or egg.hatch * (if prof.passes.hatch then 0.5 else 1)
	prof.data.slots[tostring(s)] = { kind = "egg", rarity = rarity, hatchEnd = now() + t, lucky = lucky }
	prof.dirty = true
	syncSlot(prof.plot, s)
end

---------------------------------------------------------------------------
-- Tapis roulant
---------------------------------------------------------------------------
local function rollRarity(): number
	local luck = if now() < luckUntil then 3 else 1
	local total = 0
	local w = {}
	for r, id in Config.EggOrder do
		local egg = Config.Eggs[id]
		w[r] = egg.weight * (if r >= 3 then luck else 1)
		total += w[r]
	end
	local x = rng:NextNumber() * total
	for r = 1, #w do
		x -= w[r]
		if x <= 0 then
			return r
		end
	end
	return 1
end

local buyEgg: (Player, Model) -> () = function() end

local function spawnConveyorEgg(rarity: number?, startZ: number?)
	local r = rarity or rollRarity()
	local egg = Config.eggOf(r)
	local model = PetModels.egg(egg.id, 1.25)
	model.Name = egg.id
	local root = model.PrimaryPart :: BasePart
	root.Size = Vector3.new(4, 5, 4)
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") and p ~= root then
			p.Anchored = false
			p.Massless = true
			local wc = Instance.new("WeldConstraint")
			wc.Part0 = root
			wc.Part1 = p
			wc.Parent = p
			if r >= 6 then
				p.Material = Enum.Material.Neon
			elseif r >= 4 then
				p.Material = Enum.Material.Glass
			end
		end
	end
	root.CanQuery = true
	local z0 = startZ or (CARPET_Z - 6)
	local start = CFrame.new(0, 3.6, z0)
	model:PivotTo(start)
	model:SetAttribute("Rarity", r)
	model:SetAttribute("Price", egg.price)
	local rc = Config.Rarities[r]
	local bb = billboard(root, Vector3.new(0, 5.5, 0), UDim2.fromOffset(200, 86), 110)
	label(bb, rc.name, UDim2.new(1, 0, 0.3, 0), UDim2.new(), rc.color)
	label(bb, egg.name, UDim2.new(1, 0, 0.33, 0), UDim2.fromScale(0, 0.3))
	label(bb, "$" .. fmt(egg.price), UDim2.new(1, 0, 0.37, 0), UDim2.fromScale(0, 0.63), Color3.fromHex("7CFF9E"))
	if r >= 5 then
		local l = Instance.new("PointLight")
		l.Color = rc.color
		l.Range = 14
		l.Brightness = 2
		l.Parent = root
		local sp = Instance.new("Sparkles")
		sp.SparkleColor = rc.color
		sp.Parent = root
	end
	local pr = Instance.new("ProximityPrompt")
	pr.ActionText = "Acheter"
	pr.ObjectText = egg.name .. " · $" .. fmt(egg.price)
	pr.HoldDuration = 0
	pr.MaxActivationDistance = 13
	pr.RequiresLineOfSight = false
	pr.KeyboardKeyCode = Enum.KeyCode.E
	pr.Parent = root
	pr.Triggered:Connect(function(plr)
		buyEgg(plr, model)
	end)
	model.Parent = eggFolder
	local dist = z0 + CARPET_Z - 6
	local tw = TweenService:Create(root, TweenInfo.new(dist / Config.CONVEYOR_SPEED, Enum.EasingStyle.Linear), { CFrame = CFrame.new(0, 3.6, -CARPET_Z + 6) })
	model:SetAttribute("Moving", true)
	tw:Play()
	tw.Completed:Connect(function(state)
		if state == Enum.PlaybackState.Completed and model:GetAttribute("Moving") then
			model:Destroy()
		end
	end)
	if r >= 6 and not startZ then
		Fx:FireAllClients("announce", { text = "Un " .. egg.name .. " arrive sur le tapis !", color = rc.color:ToHex(), rarity = r })
	end
end

buyEgg = function(plr: Player, model: Model)
	local prof = profiles[plr]
	if not prof or not model.Parent or not model:GetAttribute("Moving") then
		return
	end
	local r = model:GetAttribute("Rarity") :: number
	local egg = Config.eggOf(r)
	local s = freeSlot(prof)
	if not s then
		toast(plr, "Ta base est pleine ! Vends un pet ou agrandis ta base.", "FF5A6E")
		Fx:FireClient(plr, "error", {})
		return
	end
	if not spend(plr, prof, egg.price) then
		return
	end
	model:SetAttribute("Moving", false)
	local root = model.PrimaryPart :: BasePart
	local pr = root:FindFirstChildOfClass("ProximityPrompt")
	if pr then
		pr:Destroy()
	end
	local pl = prof.plot
	pl.reserved[s] = true
	local lucky = prof.passes.luck and r < Config.DIVINE and rng:NextNumber() < 0.15
	Fx:FireClient(plr, "bought", { name = egg.name })
	-- l'œuf vole jusqu'à son socle
	local u, w = slotUW(s)
	local target = plotPoint(pl, u, w, 4.5)
	local mid = (root.Position + target) / 2 + Vector3.new(0, 25, 0)
	local t1 = TweenService:Create(root, TweenInfo.new(0.7, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { CFrame = CFrame.new(mid) })
	t1:Play()
	t1.Completed:Wait()
	local t2 = TweenService:Create(root, TweenInfo.new(0.7, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { CFrame = CFrame.new(target) })
	t2:Play()
	t2.Completed:Wait()
	model:Destroy()
	pl.reserved[s] = nil
	if profiles[plr] == prof and prof.plot == pl then
		placeEgg(prof, s, if lucky then r + 1 else r, nil, lucky)
		if lucky then
			toast(plr, "🍀 Ton trèfle a amélioré l'œuf : " .. Config.eggOf(r + 1).name .. " !", "3DD68C")
		end
	end
end

---------------------------------------------------------------------------
-- Éclosion
---------------------------------------------------------------------------
local function rollPet(rarity: number): string
	local egg = Config.eggOf(rarity)
	local total = 0
	for _, e in egg.pets do
		total += e.chance
	end
	local x = rng:NextNumber() * total
	for _, e in egg.pets do
		x -= e.chance
		if x <= 0 then
			return e.pet
		end
	end
	return egg.pets[1].pet
end

local function hatchSlot(plr: Player, prof: Profile, s: number, it: Item)
	local def = rollPet(it.rarity)
	local x = rng:NextNumber()
	local tier = if x < Config.RAINBOW_CHANCE then 2 elseif x < Config.RAINBOW_CHANCE + Config.GOLD_CHANCE then 1 else 0
	local shiny = rng:NextNumber() < Config.SHINY_CHANCE
	prof.data.slots[tostring(s)] = { kind = "pet", rarity = it.rarity, def = def, tier = tier, shiny = shiny, cash = 0 }
	local isNew = not prof.data.index[def]
	prof.data.index[def] = true
	prof.dirty = true
	syncSlot(prof.plot, s)
	local u, w = slotUW(s)
	Fx:FireAllClients("hatchFx", { pos = plotPoint(prof.plot, u, w, 4), rarity = it.rarity })
	Fx:FireClient(plr, "hatched", { def = def, tier = tier, shiny = shiny, new = isNew })
	if it.rarity >= Config.MYTHIC then
		Fx:FireAllClients("announce", { text = plr.DisplayName .. " a fait éclore " .. Config.Pets[def].name .. " !", color = Config.Rarities[it.rarity].color:ToHex(), rarity = it.rarity })
	end
end

---------------------------------------------------------------------------
-- Vol
---------------------------------------------------------------------------
local function hrpOf(plr: Player): BasePart?
	local char = plr.Character
	return if char then char:FindFirstChild("HumanoidRootPart") :: BasePart? else nil
end

local function setWalkSpeed(plr: Player)
	local prof = profiles[plr]
	local char = plr.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not prof or not hum then
		return
	end
	local speed = 24 * (if prof.passes.speed then 1.3 else 1)
	if prof.carry then
		speed *= Config.STEAL_SPEED
	end
	if os.clock() < prof.stunUntil then
		speed = 0
	end
	hum.WalkSpeed = speed
end

local function carrySig(it: Item): string
	if it.kind == "pet" then
		return string.format("pet:%s:%d:%d", it.def :: string, it.tier or 0, if it.shiny then 1 else 0)
	end
	return "egg:" .. it.rarity
end

local function clearCarry(plr: Player, prof: Profile)
	prof.carry = nil
	local char = plr.Character
	if char then
		char:SetAttribute("Carry", nil)
	end
	setWalkSpeed(plr)
end

-- le pet volé retourne sur son socle
local function returnCarry(plr: Player, prof: Profile, why: string?)
	local c = prof.carry
	if not c then
		return
	end
	c.item.stolen = false
	local owner = c.plot.owner
	if owner and profiles[owner] then
		syncSlot(c.plot, c.slot)
		if why then
			toast(owner, "Ton pet est revenu dans ta base !", "3DD68C")
		end
	end
	clearCarry(plr, prof)
	if why then
		toast(plr, why, "FF5A6E")
	end
end

stealPromptHandler = function(plr: Player, pl: Plot, s: number)
	local prof = profiles[plr]
	local owner = pl.owner
	if not prof or not owner or owner == plr or prof.carry then
		return
	end
	local oprof = profiles[owner]
	local it = if oprof then itemOf(oprof, s) else nil
	if not oprof or not it or it.stolen then
		return
	end
	if now() < pl.lockUntil then
		toast(plr, "Cette base est verrouillée !", "FF5A6E")
		return
	end
	local hrp = hrpOf(plr)
	if not hrp or (hrp.Position - pl.pedestals[s].Position).Magnitude > 16 then
		return
	end
	it.stolen = true
	prof.carry = { plot = pl, slot = s, item = it, t = os.clock(), warned = false }
	local char = plr.Character
	if char then
		char:SetAttribute("Carry", carrySig(it))
	end
	setWalkSpeed(plr)
	syncSlot(pl, s)
	local name = if it.kind == "pet" then Config.Pets[it.def :: string].name else Config.eggOf(it.rarity).name
	Fx:FireClient(owner, "alarm", { text = "🚨 " .. plr.DisplayName .. " vole ton " .. name .. " !" })
	toast(plr, "Ramène " .. name .. " dans ta base, vite !", "FFD54A")
	Fx:FireClient(plr, "stealStart", {})
end

local function deliverCarry(plr: Player, prof: Profile)
	local c = prof.carry
	if not c then
		return
	end
	local s = freeSlot(prof)
	if not s then
		if not c.warned then
			c.warned = true
			toast(plr, "Ta base est pleine ! Vends un pet pour garder celui-ci.", "FF5A6E")
		end
		return
	end
	local owner = c.plot.owner
	local oprof = if owner then profiles[owner] else nil
	if oprof then
		oprof.data.slots[tostring(c.slot)] = nil
		oprof.dirty = true
		syncSlot(c.plot, c.slot)
	end
	local it = c.item
	it.stolen = false
	if it.kind == "pet" then
		it.cash = 0
		prof.data.index[it.def :: string] = true
	end
	prof.data.slots[tostring(s)] = it
	prof.data.stolen += 1
	prof.dirty = true
	clearCarry(plr, prof)
	syncSlot(prof.plot, s)
	local name = if it.kind == "pet" then Config.Pets[it.def :: string].name else Config.eggOf(it.rarity).name
	Fx:FireClient(plr, "stealOk", { text = "Vol réussi : " .. name .. " est à toi !" })
	if owner then
		toast(owner, plr.DisplayName .. " t'a volé " .. name .. " 😭", "FF5A6E")
	end
end

---------------------------------------------------------------------------
-- Batte : frappe les joueurs devant toi, un voleur lâche ce qu'il porte
---------------------------------------------------------------------------
local function swing(plr: Player)
	local prof = profiles[plr]
	local hrp = hrpOf(plr)
	if not prof or not hrp or os.clock() - prof.lastBat < 0.7 or os.clock() < prof.stunUntil then
		return
	end
	prof.lastBat = os.clock()
	Fx:FireAllClients("swing", { pos = hrp.Position })
	local look = hrp.CFrame.LookVector
	for other, oprof in profiles do
		if other == plr then
			continue
		end
		local ohrp = hrpOf(other)
		if not ohrp then
			continue
		end
		local d = ohrp.Position - hrp.Position
		if d.Magnitude < 9 and (d.Magnitude < 2 or d.Unit:Dot(look) > 0.2) then
			if oprof.carry then
				returnCarry(other, oprof, "Tu t'es fait frapper ! Le pet est retourné chez lui.")
			end
			oprof.stunUntil = os.clock() + 1.2
			setWalkSpeed(other)
			task.delay(1.25, function()
				setWalkSpeed(other)
			end)
			local dir = Vector3.new(d.X, 0, d.Z)
			dir = if dir.Magnitude > 0.01 then dir.Unit else look
			Fx:FireClient(other, "knock", { vel = dir * 70 + Vector3.new(0, 45, 0) })
			Fx:FireAllClients("bonk", { pos = ohrp.Position })
		end
	end
end

local function giveBat(plr: Player)
	local backpack = plr:FindFirstChildOfClass("Backpack")
	if not backpack or backpack:FindFirstChild("Batte") then
		return
	end
	local tool = Instance.new("Tool")
	tool.Name = "Batte"
	tool.ToolTip = "Frappe les voleurs !"
	tool.CanBeDropped = false
	tool.Grip = CFrame.new(0, -1.6, 0)
	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.7, 4.2, 0.7)
	handle.Color = Color3.fromHex("FF8FB8")
	handle.Material = Enum.Material.SmoothPlastic
	handle.CanCollide = false
	handle.Massless = true
	handle.Parent = tool
	local head = Instance.new("Part")
	head.Name = "Candy"
	head.Shape = Enum.PartType.Ball
	head.Size = Vector3.one * 1.6
	head.Color = Color3.fromHex("FFD54A")
	head.Material = Enum.Material.Glass
	head.CanCollide = false
	head.Massless = true
	head.CFrame = handle.CFrame * CFrame.new(0, 2.3, 0)
	local wc = Instance.new("WeldConstraint")
	wc.Part0 = handle
	wc.Part1 = head
	wc.Parent = head
	head.Parent = tool
	tool.Activated:Connect(function()
		swing(plr)
	end)
	tool.Parent = backpack
end

---------------------------------------------------------------------------
-- Contacts : verrou et ramassage de l'argent
---------------------------------------------------------------------------
local function lockTime(prof: Profile): number
	return Config.LOCK_TIME + (if prof.passes.lock then 30 else 0) + math.min(prof.data.rebirths, 10) * 5
end

touchHandlers[1] = function(pl: Plot, plr: Player, kind: string, s: number)
	local prof = profiles[plr]
	if not prof or pl.owner ~= plr then
		return
	end
	local key = kind .. s
	local t = os.clock()
	if (prof.touchCd[key] or 0) > t then
		return
	end
	prof.touchCd[key] = t + 0.4
	if kind == "lock" then
		if now() >= pl.lockUntil then
			pl.lockUntil = now() + lockTime(prof)
			pl.model:SetAttribute("LockUntil", pl.lockUntil)
			for _, l in pl.lasers do
				l.Transparency = 0.25
			end
			Fx:FireClient(plr, "locked", {})
		end
	elseif kind == "collect" then
		local it = itemOf(prof, s)
		if it and it.kind == "pet" and not it.stolen and (it.cash or 0) >= 1 then
			local v = math.floor(it.cash :: number)
			it.cash = 0
			addCash(prof, v)
			syncSlot(pl, s)
			local u, w = slotUW(s)
			Fx:FireClient(plr, "collect", { amount = v, pos = plotPoint(pl, u, w, 5) })
		end
	end
end

sellPromptHandler = function(plr: Player, pl: Plot, s: number)
	local prof = profiles[plr]
	if not prof or pl.owner ~= plr then
		return
	end
	local it = itemOf(prof, s)
	if not it or it.kind ~= "pet" or it.stolen then
		return
	end
	local v = Config.sellPrice(it.def :: string, it.tier or 0, it.shiny == true) * cashMult(prof) + math.floor(it.cash or 0)
	prof.data.slots[tostring(s)] = nil
	addCash(prof, v)
	syncSlot(pl, s)
	Fx:FireClient(plr, "sold", { amount = v })
end

---------------------------------------------------------------------------
-- Actions envoyées par l'interface
---------------------------------------------------------------------------
local function teleportHome(plr: Player)
	local prof = profiles[plr]
	local char = plr.Character
	if prof and char then
		char:PivotTo(plotSpawn(prof.plot))
	end
end

local handlers: { [string]: (Player, Profile, any) -> () } = {}

handlers.home = function(plr)
	teleportHome(plr)
end

handlers.expand = function(plr, prof)
	local d = prof.data
	local cost = Config.EXPAND_COST[d.level]
	if not cost then
		return
	end
	if spend(plr, prof, cost) then
		d.level += 1
		syncPlot(prof.plot)
		toast(plr, "Base agrandie : " .. openSlots(prof) .. " socles !", "3DD68C")
		Fx:FireClient(plr, "bought", {})
	end
end

handlers.rebirth = function(plr, prof)
	local d = prof.data
	local cost = Config.rebirthCost(d.rebirths)
	if d.cash < cost then
		toast(plr, "Il te faut $" .. fmt(cost) .. " pour renaître.", "FF5A6E")
		return
	end
	if prof.carry then
		returnCarry(plr, prof)
	end
	-- si quelqu'un est en train de voler un pet de cette base, il le perd
	for other, oprof in profiles do
		if oprof.carry and oprof.carry.plot == prof.plot then
			clearCarry(other, oprof)
		end
	end
	d.rebirths += 1
	d.cash = Config.START_CASH
	d.slots = {}
	d.level = 1
	prof.dirty = true
	syncPlot(prof.plot)
	Fx:FireClient(plr, "rebirth", { n = d.rebirths, mult = cashMult(prof) })
	Fx:FireAllClients("announce", { text = plr.DisplayName .. " a fait un rebirth ! (x" .. Config.rebirthMult(d.rebirths) .. ")", color = "B69CFF", rarity = 5 })
end

handlers.collectAll = function(plr, prof)
	if not prof.passes.vip then
		return
	end
	local total = 0
	for s = 1, 20 do
		local it = itemOf(prof, s)
		if it and it.kind == "pet" and not it.stolen and (it.cash or 0) >= 1 then
			total += math.floor(it.cash :: number)
			it.cash = 0
			syncSlot(prof.plot, s)
		end
	end
	if total > 0 then
		addCash(prof, total)
		Fx:FireClient(plr, "collect", { amount = total })
	end
end

Action.OnServerEvent:Connect(function(plr: Player, name: any, arg: any)
	local prof = profiles[plr]
	local h = if type(name) == "string" then handlers[name] else nil
	if prof and prof.loaded and h then
		h(plr, prof, arg)
	end
end)

---------------------------------------------------------------------------
-- Robux : passes et produits
---------------------------------------------------------------------------
MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(plr, passId, bought)
	local prof = profiles[plr]
	if not bought or not prof then
		return
	end
	for _, p in Config.Passes do
		if p.id ~= 0 and p.id == passId then
			prof.passes[p.key] = true
			toast(plr, "Pass " .. p.name .. " activé !", "3DD68C")
			setWalkSpeed(plr)
			syncPlot(prof.plot)
			prof.dirty = true
		end
	end
end)

local function grantProduct(plr: Player, prof: Profile, key: string): boolean
	local inc = math.max(incomeOf(prof), 5)
	if key == "cash1" then
		addCash(prof, math.max(1000, inc * 600))
	elseif key == "cash2" then
		addCash(prof, math.max(10e3, inc * 3600))
	elseif key == "cash3" then
		addCash(prof, math.max(100e3, inc * 28800))
	elseif key == "luckevent" then
		luckUntil = math.max(luckUntil, now()) + 600
		workspace:SetAttribute("LuckUntil", luckUntil)
		Fx:FireAllClients("announce", { text = "🌈 " .. plr.DisplayName .. " a lancé une pluie d'œufs rares !", color = "7EE0B8", rarity = 6 })
	elseif key == "mythic" then
		table.insert(prof.data.pending, Config.MYTHIC)
	elseif key == "divine" then
		table.insert(prof.data.pending, Config.DIVINE)
	else
		return false
	end
	prof.dirty = true
	toast(plr, "Merci pour ton achat !", "3DD68C")
	Fx:FireClient(plr, "bought", {})
	return true
end

MarketplaceService.ProcessReceipt = function(info)
	local plr = Players:GetPlayerByUserId(info.PlayerId)
	local prof = plr and profiles[plr]
	if not plr or not prof or not prof.loaded then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local rid = tostring(info.PurchaseId)
	if table.find(prof.data.receipts, rid) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	for _, p in Config.Products do
		if p.id ~= 0 and p.id == info.ProductId then
			if grantProduct(plr, prof, p.key) then
				table.insert(prof.data.receipts, rid)
				while #prof.data.receipts > 50 do
					table.remove(prof.data.receipts, 1)
				end
				return Enum.ProductPurchaseDecision.PurchaseGranted
			end
		end
	end
	return Enum.ProductPurchaseDecision.NotProcessedYet
end

---------------------------------------------------------------------------
-- Arrivée et départ des joueurs
---------------------------------------------------------------------------
local function save(plr: Player, prof: Profile)
	local st = store
	if not st or not prof.loaded then
		return
	end
	local d = prof.data
	-- les œufs gardent leur temps restant
	local slots = {}
	for k, it in d.slots do
		local c = table.clone(it)
		c.stolen = nil
		if c.hatchEnd then
			c.hatchLeft = math.max(0, c.hatchEnd - now())
			c.hatchEnd = nil
		end
		slots[k] = c
	end
	local out = table.clone(d) :: any
	out.slots = slots
	for _ = 1, 3 do
		local ok = pcall(function()
			st:SetAsync("p_" .. plr.UserId, out)
		end)
		if ok then
			return
		end
		task.wait(1)
	end
end

local function onCharacter(plr: Player, char: Model)
	local prof = profiles[plr]
	if not prof then
		return
	end
	if prof.carry then
		returnCarry(plr, prof)
	end
	task.defer(function()
		char:PivotTo(plotSpawn(prof.plot))
		giveBat(plr)
		setWalkSpeed(plr)
	end)
	local hum = char:WaitForChild("Humanoid") :: Humanoid
	hum.Died:Connect(function()
		if prof.carry then
			returnCarry(plr, prof, "Tu as perdu le pet que tu portais !")
		end
	end)
end

local function onPlayer(plr: Player)
	local pl: Plot? = nil
	for _, p in plots do
		if not p.owner then
			pl = p
			break
		end
	end
	if not pl then
		plr:Kick("Le serveur est plein, réessaie dans un autre serveur !")
		return
	end
	pl.owner = plr
	local prof: Profile = { data = defaultData(), plot = pl, passes = {}, carry = nil, stunUntil = 0, lastBat = 0, dirty = true, loaded = false, touchCd = {} }
	profiles[plr] = prof

	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local cash = Instance.new("StringValue")
	cash.Name = "Argent"
	cash.Parent = ls
	local rb = Instance.new("IntValue")
	rb.Name = "Rebirths"
	rb.Parent = ls
	ls.Parent = plr

	local st = store
	if st then
		local ok, saved = pcall(function()
			return st:GetAsync("p_" .. plr.UserId)
		end)
		if ok and type(saved) == "table" then
			local d = prof.data
			d.cash = tonumber(saved.cash) or d.cash
			d.rebirths = tonumber(saved.rebirths) or 0
			d.level = math.clamp(tonumber(saved.level) or 1, 1, #Config.SLOT_LEVELS)
			d.index = if type(saved.index) == "table" then saved.index else {}
			d.receipts = if type(saved.receipts) == "table" then saved.receipts else {}
			d.pending = if type(saved.pending) == "table" then saved.pending else {}
			d.stolen = tonumber(saved.stolen) or 0
			if type(saved.slots) == "table" then
				for k, it in saved.slots do
					if type(it) == "table" and (it.kind == "pet" and Config.Pets[it.def]) then
						d.slots[k] = { kind = "pet", rarity = it.rarity, def = it.def, tier = it.tier or 0, shiny = it.shiny == true, cash = tonumber(it.cash) or 0 }
					elseif type(it) == "table" and it.kind == "egg" and Config.Eggs["r" .. tostring(it.rarity)] then
						d.slots[k] = { kind = "egg", rarity = it.rarity, hatchEnd = now() + (tonumber(it.hatchLeft) or 0) }
					end
				end
			end
		elseif not ok then
			warn("Chargement impossible pour " .. plr.Name .. " : la progression ne sera pas sauvegardée cette fois.")
			prof.data.receipts = {}
		end
	end
	if profiles[plr] ~= prof then
		return
	end
	for _, p in Config.Passes do
		if p.id ~= 0 then
			local ok, owns = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(plr.UserId, p.id)
			end)
			if ok and owns then
				prof.passes[p.key] = true
			end
		end
	end
	prof.loaded = true
	syncPlot(pl)
	plr.CharacterAdded:Connect(function(char)
		onCharacter(plr, char)
	end)
	if plr.Character then
		onCharacter(plr, plr.Character)
	end
	sendState(plr)
	toast(plr, "Bienvenue ! Achète des œufs sur le tapis rouge 🥚", "FFD54A")
end

Players.PlayerAdded:Connect(onPlayer)
for _, plr in Players:GetPlayers() do
	task.spawn(onPlayer, plr)
end

Players.PlayerRemoving:Connect(function(plr)
	local prof = profiles[plr]
	if not prof then
		return
	end
	if prof.carry then
		returnCarry(plr, prof)
	end
	-- les voleurs de cette base perdent leur butin (il reste au propriétaire)
	for other, oprof in profiles do
		if oprof.carry and oprof.carry.plot == prof.plot then
			oprof.carry.item.stolen = false
			clearCarry(other, oprof)
		end
	end
	save(plr, prof)
	profiles[plr] = nil
	local pl = prof.plot
	pl.owner = nil
	pl.lockUntil = 0
	pl.model:SetAttribute("LockUntil", 0)
	for _, l in pl.lasers do
		l.Transparency = 1
	end
	syncPlot(pl)
end)

game:BindToClose(function()
	for plr, prof in profiles do
		task.spawn(save, plr, prof)
	end
	task.wait(3)
end)

task.spawn(function()
	while true do
		task.wait(60)
		for plr, prof in profiles do
			task.spawn(save, plr, prof)
		end
	end
end)

---------------------------------------------------------------------------
-- Boucle principale
---------------------------------------------------------------------------
local spawnAcc, incomeAcc, fastAcc = 0, 0, 0
-- au démarrage, le tapis est déjà rempli
for k = 0, 21 do
	spawnConveyorEgg(nil, (CARPET_Z - 6) - k * 23)
end

RunService.Heartbeat:Connect(function(dt)
	spawnAcc += dt
	incomeAcc += dt
	fastAcc += dt
	if spawnAcc >= Config.CONVEYOR_EVERY then
		spawnAcc = 0
		spawnConveyorEgg()
	end
	local t = now()
	if fastAcc >= 0.2 then
		fastAcc = 0
		for plr, prof in profiles do
			-- voleur arrivé chez lui, ou trop lent
			local c = prof.carry
			if c then
				local hrp = hrpOf(plr)
				if not hrp or os.clock() - c.t > Config.CARRY_TIME then
					returnCarry(plr, prof, "Trop lent ! Le pet est retourné chez lui.")
				elseif insidePlot(prof.plot, hrp.Position) then
					deliverCarry(plr, prof)
				end
			end
		end
		for _, pl in plots do
			local locked = t < pl.lockUntil
			if pl.owner then
				pl.timer.Text = if locked then "🔒 " .. Config.fmtTime(pl.lockUntil - t) else "🔓 Ouverte"
				pl.timer.TextColor3 = if locked then Color3.fromHex("FF5A6E") else Color3.fromHex("7CFF9E")
			else
				pl.timer.Text = ""
			end
			if not locked and pl.lasers[1].Transparency < 1 then
				for _, l in pl.lasers do
					l.Transparency = 1
				end
			end
			if locked then
				-- les visiteurs sont repoussés hors d'une base verrouillée
				for plr in profiles do
					if plr ~= pl.owner then
						local hrp = hrpOf(plr)
						if hrp and insidePlot(pl, hrp.Position) then
							local char = plr.Character :: Model
							char:PivotTo(CFrame.lookAt(Vector3.new(pl.side * (INNER - 8), hrp.Position.Y + 1, math.clamp(hrp.Position.Z, pl.cz - 40, pl.cz + 40)), Vector3.new(0, hrp.Position.Y + 1, pl.cz)))
							toast(plr, "Cette base est verrouillée !", "FF5A6E")
						end
					end
				end
			end
		end
	end
	if incomeAcc >= 1 then
		local step = incomeAcc
		incomeAcc = 0
		for plr, prof in profiles do
			if not prof.loaded then
				continue
			end
			local mult = cashMult(prof)
			local hrp = hrpOf(plr)
			for s = 1, 20 do
				local it = itemOf(prof, s)
				if not it then
					continue
				end
				if it.kind == "pet" and not it.stolen then
					it.cash = (it.cash or 0) + Config.petIncome(it.def :: string, it.tier or 0, it.shiny == true) * mult * step
					prof.plot.pedestals[s]:SetAttribute("Cash", math.floor(it.cash :: number))
					-- le propriétaire debout sur la plaque verte ramasse en continu
					if hrp then
						local u, w = slotUW(s)
						local plate = plotPoint(prof.plot, u - 5.8, w, hrp.Position.Y)
						if (plate - hrp.Position).Magnitude < 4.5 and hrp.Position.Y < 10 then
							touchHandlers[1](prof.plot, plr, "collect", s)
						end
					end
				elseif it.kind == "egg" and not it.stolen and (it.hatchEnd or 0) <= t then
					hatchSlot(plr, prof, s, it)
				end
			end
			-- œufs achetés en Robux qui attendaient une place
			while #prof.data.pending > 0 do
				local s = freeSlot(prof)
				if not s then
					break
				end
				local r = table.remove(prof.data.pending, 1) :: number
				placeEgg(prof, s, r)
				toast(plr, Config.eggOf(r).name .. " livré dans ta base !", "FFD54A")
			end
			prof.dirty = true
		end
	end
	for plr, prof in profiles do
		if prof.dirty and prof.loaded then
			prof.dirty = false
			sendState(plr)
		end
	end
end)
