--!strict
-- Modèles des marteaux à bonbons. La poignée part de l'origine (la main) vers +Y,
-- la tête est en haut. Utilisé dans la main des joueurs et dans les vignettes.

local Config = require(script.Parent.Config)

local HammerModels = {}

local function hex(h: string): Color3
	return Color3.fromHex(h)
end

local MAT: { [string]: Enum.Material } = {
	Glass = Enum.Material.Glass,
	Neon = Enum.Material.Neon,
	Foil = Enum.Material.Foil,
}

function HammerModels.def(id: string): Config.Hammer
	for _, h in Config.Hammers do
		if h.id == id then
			return h
		end
	end
	return Config.Hammers[1]
end

-- scale : 1 = taille dans la main (environ 3,6 studs de long)
function HammerModels.build(id: string, scale: number?, anchored: boolean?): Model
	local h = HammerModels.def(id)
	local s = scale or 1
	local model = Instance.new("Model")
	model.Name = "Hammer_" .. h.id
	local headMat = if h.mat then MAT[h.mat] else Enum.Material.SmoothPlastic

	local function add(shape: string, size: Vector3, cf: CFrame, color: string, mat: Enum.Material?): BasePart
		local p = Instance.new("Part")
		p.Size = size * s
		p.CFrame = CFrame.new(cf.Position * s) * cf.Rotation
		p.Color = hex(color)
		p.Material = mat or Enum.Material.SmoothPlastic
		p.Anchored = anchored == true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.Massless = true
		p.CastShadow = false
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		if shape == "ball" then
			p.Shape = Enum.PartType.Ball
		elseif shape == "cyl" then
			p.Shape = Enum.PartType.Cylinder
		end
		p.Parent = model
		return p
	end
	local UP = CFrame.Angles(0, 0, math.rad(90)) -- cylindre vertical
	local FACE = CFrame.Angles(0, math.rad(90), 0) -- disque face à l'avant (-Z)

	-- poignée
	local handle = add("cyl", Vector3.new(2.6, 0.32, 0.32), CFrame.new(0, 1.2, 0) * UP, h.handle)
	handle.Name = "Handle"
	add("cyl", Vector3.new(0.3, 0.42, 0.42), CFrame.new(0, 0.05, 0) * UP, h.accent)
	add("cyl", Vector3.new(0.3, 0.42, 0.42), CFrame.new(0, 2.3, 0) * UP, h.accent)
	local top = 2.9

	if h.shape == "mallet" or h.shape == "rainbow" then
		add("cyl", Vector3.new(1.7, 1.05, 1.05), CFrame.new(0, top, 0), h.head, headMat)
		for _, x in { -0.85, 0.85 } do
			add("cyl", Vector3.new(0.22, 1.2, 1.2), CFrame.new(x, top, 0), h.accent, headMat)
		end
		if h.shape == "rainbow" then
			local cols = { "FF5A6E", "FF9A3C", "FFD54A", "7EE0B8", "7FD6FF", "B69CFF" }
			for i, c in cols do
				add("cyl", Vector3.new(0.24, 1.1, 1.1), CFrame.new(-0.7 + (i - 1) * 0.28, top, 0), c, Enum.Material.Neon)
			end
		end
	elseif h.shape == "lolly" then
		add("cyl", Vector3.new(0.3, 1.9, 1.9), CFrame.new(0, top + 0.3, 0) * FACE, h.head, headMat)
		add("cyl", Vector3.new(0.34, 1.25, 1.25), CFrame.new(0, top + 0.3, 0) * FACE, h.accent)
		add("cyl", Vector3.new(0.38, 0.6, 0.6), CFrame.new(0, top + 0.3, 0) * FACE, h.head, headMat)
	elseif h.shape == "cane" then
		for i = 0, 5 do
			add("cyl", Vector3.new(0.45, 0.5, 0.5), CFrame.new(0, 2.5 + i * 0.4, 0) * UP, if i % 2 == 0 then h.head else h.accent)
		end
		for k = 1, 6 do
			local a = math.pi * k / 6
			add("ball", Vector3.one * 0.52, CFrame.new(0.5 - math.cos(a) * 0.5, 4.8 + math.sin(a) * 0.5, 0), if k % 2 == 0 then h.head else h.accent)
		end
	elseif h.shape == "donut" then
		for i = 0, 11 do
			local a = i / 12 * math.pi * 2
			local p = CFrame.new(math.cos(a) * 0.7, top + 0.4 + math.sin(a) * 0.7, 0)
			add("ball", Vector3.one * 0.62, p, h.head, headMat)
			add("ball", Vector3.one * 0.46, p * CFrame.new(0, 0, -0.18), h.accent)
		end
	elseif h.shape == "cone" then
		for i = 0, 3 do
			add("cyl", Vector3.new(0.3, 0.35 + i * 0.22, 0.35 + i * 0.22), CFrame.new(0, 2.4 + i * 0.3, 0) * UP, "E8A85A")
		end
		add("ball", Vector3.one * 1.2, CFrame.new(0, 3.75, 0), h.head, headMat)
		add("ball", Vector3.one * 0.95, CFrame.new(0, 4.5, 0), h.accent)
		add("ball", Vector3.one * 0.3, CFrame.new(0, 5.05, 0), "E8344E")
	elseif h.shape == "cupcake" then
		add("cyl", Vector3.new(0.8, 1.2, 1.2), CFrame.new(0, top, 0) * UP, h.accent)
		for i = 0, 5 do
			local a = i / 6 * math.pi * 2
			add("ball", Vector3.one * 0.7, CFrame.new(math.cos(a) * 0.4, top + 0.6, math.sin(a) * 0.4), h.head)
		end
		add("ball", Vector3.one * 0.8, CFrame.new(0, top + 1.0, 0), h.head)
		add("ball", Vector3.one * 0.38, CFrame.new(0, top + 1.5, 0), "E8344E")
	elseif h.shape == "crystal" then
		for i = 0, 2 do
			add("block", Vector3.new(0.5, 1.8, 0.5), CFrame.new(0, top + 0.4, 0) * CFrame.Angles(0, math.rad(i * 60), math.rad(18 * (i - 1))), h.head, headMat)
		end
		add("ball", Vector3.one * 0.7, CFrame.new(0, top, 0), h.accent, Enum.Material.Neon)
	elseif h.shape == "star" then
		for i = 0, 4 do
			add("block", Vector3.new(0.5, 1.9, 0.3), CFrame.new(0, top + 0.5, 0) * CFrame.Angles(0, 0, math.rad(i * 72)), h.head, headMat)
		end
		add("ball", Vector3.one * 0.8, CFrame.new(0, top + 0.5, 0), h.accent, Enum.Material.Neon)
	elseif h.shape == "bolt" then
		local zig = { { 0.0, 2.6, 25 }, { 0.3, 3.3, -30 }, { -0.1, 4.0, 25 }, { 0.25, 4.7, -30 } }
		for _, z in zig do
			add("block", Vector3.new(0.4, 0.9, 0.35), CFrame.new(z[1], z[2], 0) * CFrame.Angles(0, 0, math.rad(z[3])), h.head, headMat)
		end
		add("ball", Vector3.one * 0.6, CFrame.new(0.1, 5.2, 0), h.accent, Enum.Material.Neon)
	end

	-- brillance pour les plus rares
	if h.rarity >= 5 then
		local pe = Instance.new("ParticleEmitter")
		pe.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		pe.Color = ColorSequence.new(hex(h.head), hex(h.accent))
		pe.LightEmission = 1
		pe.Rate = 10
		pe.Lifetime = NumberRange.new(0.5, 1)
		pe.Speed = NumberRange.new(0.5, 1.5)
		pe.SpreadAngle = Vector2.new(180, 180)
		pe.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3 * s), NumberSequenceKeypoint.new(1, 0) })
		local head = model:GetChildren()[#model:GetChildren()] :: BasePart
		pe.Parent = head
	end
	model.PrimaryPart = handle
	return model
end

return HammerModels
