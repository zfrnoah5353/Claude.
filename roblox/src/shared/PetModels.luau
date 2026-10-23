--!strict
-- Construit les modèles 3D des pets et des œufs à partir de formes simples.
-- Utilisé par le serveur (boss, socles d'œufs) et par les joueurs (pets, vignettes).

local Config = require(script.Parent.Config)

local PetModels = {}

local DARK = Color3.fromHex("3A3358")

type Shape = "ellipsoid" | "ball" | "block" | "cyl" | "wedge"

local function makePart(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, shape: Shape): BasePart
	local p: BasePart = if shape == "wedge" then Instance.new("WedgePart") else Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if shape == "ellipsoid" then
		local m = Instance.new("SpecialMesh")
		m.MeshType = Enum.MeshType.Sphere
		m.Parent = p
	elseif shape == "ball" then
		(p :: Part).Shape = Enum.PartType.Ball
	elseif shape == "cyl" then
		(p :: Part).Shape = Enum.PartType.Cylinder
	end
	p.CFrame = cf
	p.Parent = parent
	return p
end

local PetShapes = require(script.Parent.PetShapes)
local HttpService = game:GetService("HttpService")
-- Plans détaillés générés par tools/web (un module JSON par pet). Sans plan, on retombe sur PetShapes.
local PlanFolder = script.Parent:FindFirstChild("PetPlans")

local GOLD_HEX = "F2C14E"
local plans: { [string]: any } = {}
local rigs: { [string]: any } = {}

local function toHex(c: Color3?): string?
	return if c then c:ToHex() else nil
end

-- Plan (liste de pièces) d'un pet, mis en cache
function PetModels.plan(defId: string): { any }
	local cached = plans[defId]
	if cached then
		return cached
	end
	local def = Config.Pets[defId] or Config.Pets.gumdrop_bunny
	local mod = PlanFolder and PlanFolder:FindFirstChild(def.id)
	if mod and mod:IsA("ModuleScript") then
		local data = HttpService:JSONDecode((require :: any)(mod))
		local clips = {}
		for state, list in data.anims do
			local out = {}
			for _, t in list do
				table.insert(out, { bone = t.bone, axis = t.axis, amp = t.amp, freq = t.freq, phase = t.phase, base = t.base })
			end
			clips[state] = out
		end
		plans[defId] = data.parts
		rigs[defId] = { bones = data.bones, clips = clips }
		return data.parts
	end
	local colors = {
		body = def.body:ToHex(),
		belly = def.belly:ToHex(),
		dark = toHex(def.dark) or def.body:Lerp(Color3.new(0, 0, 0), 0.3):ToHex(),
		accent = toHex(def.accent) or GOLD_HEX,
		glow = toHex(def.glow),
	}
	local parts, bones = PetShapes.build(def.species, colors)
	plans[defId] = parts
	rigs[defId] = { bones = bones, clips = PetShapes.bindAnims(def.species, bones) }
	return parts
end

-- Os et animations d'un pet (nil si le pet n'est pas animé)
function PetModels.rig(defId: string): any
	PetModels.plan(defId)
	return rigs[defId]
end

local MATERIAL = {
	plastic = Enum.Material.SmoothPlastic,
	neon = Enum.Material.Neon,
	metal = Enum.Material.SmoothPlastic,
	glass = Enum.Material.Glass,
}

-- Les plus grandes pièces d'un plan (vignettes : on garde les maxParts plus grosses)
local thumbs: { [string]: { any } } = {}
local function biggest(defId: string, maxParts: number): { any }
	local key = defId .. ":" .. maxParts
	if thumbs[key] then
		return thumbs[key]
	end
	local list = table.clone(PetModels.plan(defId))
	if #list > maxParts then
		local function vol(sp: any): number
			return sp.size[1] * sp.size[2] * sp.size[3]
		end
		table.sort(list, function(a, b)
			return vol(a) > vol(b)
		end)
		local cut = table.create(maxParts)
		table.move(list, 1, maxParts, 1, cut)
		list = cut
	end
	thumbs[key] = list
	return list
end

-- build(defId, tier, shiny, scale, locked, maxParts) -> Model centré sur l'origine, face vers -Z.
-- tier : 0 normal, 1 doré, 2 arc-en-ciel. locked : silhouette sombre (index).
-- maxParts : limite le nombre de pièces (vignettes de l'interface).
-- Les pièces marquées « Spin » (attribut Spin = "Y" ou "Z") tournent autour du pet ;
-- leur position de départ par rapport au pet est gardée dans l'attribut Offset.
function PetModels.build(defId: string, tier: number, shiny: boolean, scale: number, locked: boolean?, maxParts: number?): Model
	local def = Config.Pets[defId] or Config.Pets.gumdrop_bunny
	local s = scale
	local model = Instance.new("Model")
	model.Name = def.name
	local root = makePart(model, "Root", Vector3.one * 0.2, CFrame.identity, def.body, "block")
	root.Transparency = 1
	model.PrimaryPart = root

	local gold = Color3.fromHex("FFD23F")
	local firstBody: BasePart? = nil
	local list: { any } = if maxParts then biggest(defId, maxParts) else PetModels.plan(defId)
	for _, sp in list do
		local color = Color3.fromHex(sp.color)
		local isBody = sp.name == "Body"
		if locked then
			color = DARK
		elseif tier == 1 and isBody then
			color = color:Lerp(gold, 0.65)
		elseif tier == 2 and isBody then
			color = color:Lerp(Color3.fromHex("FF9AE6"), 0.5)
		end
		local r = sp.rot
		local cf = CFrame.new(sp.pos[1] * s, sp.pos[2] * s, sp.pos[3] * s, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9])
		local shape: Shape = if sp.shape == "cyl" then "cyl" elseif sp.shape == "ball" then "ball" elseif sp.shape == "ellipsoid" then "ellipsoid" elseif sp.shape == "wedge" then "wedge" else "block"
		local size = Vector3.new(sp.size[1], sp.size[2], sp.size[3]) * s
		local p = makePart(model, if isBody then "Body" else "Part", size, cf, color, shape)
		if not locked then
			p.Material = MATERIAL[sp.mat] or Enum.Material.SmoothPlastic
			if sp.mat == "metal" then
				p.Reflectance = 0.2
			end
		end
		p.Transparency = sp.alpha or 0
		if sp.bone and sp.bone > 0 then
			p:SetAttribute("Bone", sp.bone)
		end
		if sp.tag == "SpinY" or sp.tag == "SpinZ" then
			p:SetAttribute("Spin", if sp.tag == "SpinY" then "Y" else "Z")
			if sp.pivot then
				p:SetAttribute("Center", Vector3.new(sp.pivot[1], sp.pivot[2], sp.pivot[3]) * s)
			end
		end
		if tier == 1 and isBody and not locked then
			p.Reflectance = 0.15
		end
		if isBody and not firstBody then
			firstBody = p
		end
	end

	if tier == 2 and not locked then
		model:SetAttribute("Rainbow", true)
	end
	model:SetAttribute("Def", defId)
	model:SetAttribute("Scale", s)
	local anchorPart = firstBody or root
	if shiny and not locked then
		local sp = Instance.new("Sparkles")
		sp.SparkleColor = Color3.fromHex("FFF6C8")
		sp.Parent = anchorPart
	end
	-- aura des créatures mythiques et divines
	if def.rarity >= Config.MYTHIC and not locked then
		local glow = def.glow or Config.Rarities[def.rarity].color
		local light = Instance.new("PointLight")
		light.Color = glow
		light.Brightness = if def.rarity >= Config.DIVINE then 3 else 1.5
		light.Range = 8 * s
		light.Parent = anchorPart
		local pe = Instance.new("ParticleEmitter")
		pe.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		pe.Color = ColorSequence.new(glow, Color3.new(1, 1, 1))
		pe.LightEmission = 1
		pe.Rate = if def.rarity >= Config.DIVINE then 14 else 5
		pe.Lifetime = NumberRange.new(0.8, 1.6)
		pe.Speed = NumberRange.new(0.5, 1.5)
		pe.SpreadAngle = Vector2.new(180, 180)
		pe.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.35 * s), NumberSequenceKeypoint.new(1, 0) })
		pe.Transparency = NumberSequence.new(0.2, 1)
		pe.Parent = anchorPart
		model:SetAttribute("Aura", def.rarity)
	end
	return model
end

-- Prépare l'animation d'un modèle construit par build() (pose de repos à l'origine).
-- Renvoie nil si le pet n'a ni os ni pièces qui tournent.
function PetModels.animator(model: Model): any
	local defId = model:GetAttribute("Def") :: string
	local s = (model:GetAttribute("Scale") :: number?) or 1
	local rig = PetModels.rig(defId)
	local recs = {}
	local animated = false
	for _, b in rig.bones do
		if b.spin then
			animated = true
		end
	end
	for _, p in model:GetChildren() do
		if p:IsA("BasePart") then
			local bone = (p:GetAttribute("Bone") :: number?) or 0
			local spin = p:GetAttribute("Spin") :: string?
			if bone > 0 or spin then
				animated = true
			end
			table.insert(recs, { part = p, offset = p.CFrame, bone = bone, spin = spin, center = (p:GetAttribute("Center") :: Vector3?) or Vector3.zero })
		end
	end
	if not animated then
		return nil
	end
	local bones = {}
	for i, b in rig.bones do
		local spin = nil
		if b.spin then
			spin = { axis = Vector3.new(b.spin.axis[1], b.spin.axis[2], b.spin.axis[3]).Unit, speed = b.spin.speed * math.pi }
		end
		bones[i] = { parent = b.parent, pivot = Vector3.new(b.pivot[1], b.pivot[2], b.pivot[3]) * s, cur = CFrame.identity, spin = spin }
	end
	local parts = table.create(#recs)
	for i, r in recs do
		parts[i] = r.part
	end
	-- pistes rangées par état puis par os (évite de parcourir toutes les pistes pour chaque os)
	local byBone = {}
	for state, list in rig.clips or {} do
		local m = {}
		for _, tr in list do
			m[tr.bone] = m[tr.bone] or {}
			table.insert(m[tr.bone], tr)
		end
		byBone[state] = m
	end
	return { recs = recs, parts = parts, cfs = table.create(#recs), bones = bones, clips = byBone, G = {} }
end

-- Pose le modèle à « pivot » pour l'état idle / move / ability à l'instant t.
-- Les os passent en douceur d'un état à l'autre (dt = temps écoulé).
function PetModels.pose(anim: any, pivot: CFrame, state: string, t: number, dt: number)
	local G = anim.G
	G[0] = CFrame.identity
	local tracks = anim.clips and anim.clips[state]
	local k = 1 - math.exp(-10 * dt)
	for i, b in anim.bones do
		local target = CFrame.identity
		local mine = tracks and tracks[i]
		if mine then
			for _, tr in mine do
				local ang = math.rad(tr.base + tr.amp * math.sin(2 * math.pi * tr.freq * t + tr.phase))
				target *= CFrame.fromAxisAngle(Vector3.new(tr.axis[1], tr.axis[2], tr.axis[3]), ang)
			end
		end
		if b.spin then
			b.cur = CFrame.fromAxisAngle(b.spin.axis, b.spin.speed * t) -- rotation continue (auréoles, engrenages)
		else
			b.cur = b.cur:Lerp(target, k)
		end
		G[i] = G[b.parent] * CFrame.new(b.pivot) * b.cur * CFrame.new(-b.pivot)
	end
	local cfs = anim.cfs
	for i, r in anim.recs do
		local m = pivot * G[r.bone]
		if r.spin == "Y" then
			m = m * CFrame.new(r.center) * CFrame.Angles(0, t * 0.9, 0) * CFrame.new(-r.center)
		elseif r.spin == "Z" then
			m = m * CFrame.new(r.center) * CFrame.Angles(0, 0, t * 0.6) * CFrame.new(-r.center)
		end
		cfs[i] = m * r.offset
	end
	workspace:BulkMoveTo(anim.parts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
end

-- Œuf décoratif (socles et animation d'éclosion)
function PetModels.egg(eggId: string, scale: number): Model
	local e = Config.Eggs[eggId]
	local model = Instance.new("Model")
	model.Name = e.name
	local root = makePart(model, "Root", Vector3.one * 0.2, CFrame.identity, e.shell, "block")
	root.Transparency = 1
	model.PrimaryPart = root
	makePart(model, "Shell", Vector3.new(3, 3.8, 3) * scale, CFrame.identity, e.shell, "ellipsoid")
	local spots = { Vector3.new(-0.9, 0.5, -1.15), Vector3.new(0.8, -0.6, -1.2), Vector3.new(0.3, 1.2, -1.05), Vector3.new(1.3, 0.6, 0.3), Vector3.new(-1.2, -0.4, 0.6) }
	for i, pos in spots do
		local d = (i == 2) and 0.85 or 0.6
		makePart(model, "Spot", Vector3.new(d, d, 0.3) * scale, CFrame.lookAt(pos * scale, pos * scale * 2), e.spot, "ellipsoid")
	end
	return model
end

-- Puissance d'un pet possédé (même formule côté serveur et côté joueur)
function PetModels.power(p: { def: string, tier: number, shiny: boolean?, lvl: number, bonus: number? }): number
	local def = Config.Pets[p.def]
	if not def then
		return 0
	end
	local base = def.power
	if p.bonus and p.bonus > 0 then
		base = p.bonus
	end
	local m = Config.tierMult(p.tier)
	if p.shiny then
		m *= 1.5
	end
	return base * m * (1 + 0.05 * p.lvl)
end

return PetModels
