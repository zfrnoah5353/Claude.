--!strict
-- Décor des mondes, calculé sans Roblox (pur Luau) : une liste de pièces.
-- Le serveur les crée ; tools/web peut aussi les afficher pour un aperçu.
-- Repère : origine du monde, champ de bonbons |x| < 110 et -70 < z < 110,
-- place des œufs autour de z = -115, murs à |x| = 202 et |z| = 172.
-- Une pièce : { s = forme, size = {x,y,z}, p = {x,y,z}, r = {rx,ry,rz} en degrés,
-- c = couleur hex, m = matériau, t = transparence, col = collision, light = portée,
-- fx = "sparkle" | "bubbles" | "snow" | "stars" }

export type Spec = {
	s: string,
	size: { number },
	p: { number },
	r: { number }?,
	c: string,
	m: string?,
	t: number?,
	col: boolean?,
	light: number?,
	fx: string?,
}

local Decor = {}

-- champ de bonbons (les tas apparaissent dedans) : |x| < FX, Z0 < z < Z1
Decor.FX, Decor.Z0, Decor.Z1 = 110, -70, 110
local FX, Z0, Z1 = Decor.FX, Decor.Z0, Decor.Z1
-- bosquets dans le champ (les tas de bonbons évitent un rayon de GROVE_R autour)
Decor.GROVES = { { -75, -35 }, { 75, -35 }, { -78, 62 }, { 78, 62 }, { -32, 96 }, { 34, 96 } }
Decor.GROVE_R = 14

type Ctx = { out: { Spec }, rnd: () -> number }

local function rand(ctx: Ctx, a: number, b: number): number
	return a + (b - a) * ctx.rnd()
end

local function pick<T>(ctx: Ctx, list: { T }): T
	return list[math.floor(ctx.rnd() * #list) + 1]
end

local function add(ctx: Ctx, s: string, size: { number }, p: { number }, c: string, extra: { [string]: any }?): Spec
	local spec: Spec = { s = s, size = size, p = p, c = c }
	if extra then
		for k, v in extra do
			(spec :: any)[k] = v
		end
	end
	table.insert(ctx.out, spec)
	return spec
end

local function ball(ctx: Ctx, d: number, x: number, y: number, z: number, c: string, extra: { [string]: any }?)
	return add(ctx, "ball", { d, d, d }, { x, y, z }, c, extra)
end

-- cylindre vertical (l'axe d'un cylindre Roblox est X : on le tourne de 90° sur Z)
local function pole(ctx: Ctx, d: number, h: number, x: number, y0: number, z: number, c: string, extra: { [string]: any }?)
	local e: { [string]: any } = extra or {}
	e.r = { 0, 0, 90 }
	return add(ctx, "cyl", { h, d, d }, { x, y0 + h / 2, z }, c, e)
end

-- disque horizontal
local function disc(ctx: Ctx, d: number, h: number, x: number, y: number, z: number, c: string, extra: { [string]: any }?)
	local e: { [string]: any } = extra or {}
	e.r = { 0, 0, 90 }
	return add(ctx, "cyl", { h, d, d }, { x, y, z }, c, e)
end

local function box(ctx: Ctx, sx: number, sy: number, sz: number, x: number, y: number, z: number, c: string, extra: { [string]: any }?)
	return add(ctx, "block", { sx, sy, sz }, { x, y, z }, c, extra)
end

---------------------------------------------------------------------------
-- Accessoires
---------------------------------------------------------------------------
local function lollipop(ctx: Ctx, x: number, z: number, h: number, c: string, c2: string)
	pole(ctx, h * 0.07, h, x, 0, z, "FFFFFF", { col = true })
	local d = h * 0.55
	local yaw = rand(ctx, 0, 180)
	local y = h + d * 0.4
	-- disque face caméra : cylindre couché tourné sur Y
	add(ctx, "cyl", { d * 0.16, d, d }, { x, y, z }, c, { r = { 0, yaw, 0 } })
	add(ctx, "cyl", { d * 0.18, d * 0.66, d * 0.66 }, { x, y, z }, c2, { r = { 0, yaw, 0 } })
	add(ctx, "cyl", { d * 0.2, d * 0.33, d * 0.33 }, { x, y, z }, c, { r = { 0, yaw, 0 } })
	add(ctx, "block", { d * 0.22, d * 0.06, d * 0.1 }, { x, y + h * 0.02, z }, "FFFFFF", { r = { 0, yaw + 90, 0 } })
end

local function candyCane(ctx: Ctx, x: number, z: number, h: number, yaw: number, c: string)
	local d = math.max(0.8, h * 0.08)
	local n = math.max(4, math.floor(h / (d * 1.2)))
	for i = 0, n - 1 do
		pole(ctx, d, h / n, x, i * h / n, z, if i % 2 == 0 then c else "FFFFFF", { col = i == 0 })
	end
	-- crochet
	local r = h * 0.16
	local ry = math.rad(yaw)
	for k = 1, 6 do
		local a = math.pi * k / 6
		local cx, cy = r - math.cos(a) * r, h + math.sin(a) * r
		add(ctx, "ball", { d * 1.02, d * 1.02, d * 1.02 }, { x + math.cos(ry) * cx, cy, z - math.sin(ry) * cx }, if k % 2 == 0 then c else "FFFFFF")
	end
end

local function gumdropTree(ctx: Ctx, x: number, z: number, h: number, cols: { string })
	pole(ctx, h * 0.12, h * 0.6, x, 0, z, "FFF6E6", { col = true })
	for i = 1, 4 do
		local d = h * rand(ctx, 0.32, 0.45)
		ball(ctx, d, x + rand(ctx, -h * 0.18, h * 0.18), h * 0.62 + rand(ctx, -h * 0.05, h * 0.18), z + rand(ctx, -h * 0.18, h * 0.18), pick(ctx, cols))
	end
end

local function cottonTree(ctx: Ctx, x: number, z: number, h: number, c: string)
	pole(ctx, h * 0.08, h * 0.55, x, 0, z, "FFFFFF", { col = true })
	for i = 1, 6 do
		local d = h * rand(ctx, 0.25, 0.36)
		ball(ctx, d, x + rand(ctx, -h * 0.2, h * 0.2), h * 0.6 + rand(ctx, 0, h * 0.25), z + rand(ctx, -h * 0.2, h * 0.2), c, { m = "Sand" })
	end
end

local function bush(ctx: Ctx, x: number, z: number, s: number, cols: { string })
	for i = 1, 3 do
		ball(ctx, s * rand(ctx, 0.7, 1.1), x + rand(ctx, -s * 0.5, s * 0.5), s * 0.3, z + rand(ctx, -s * 0.5, s * 0.5), pick(ctx, cols), { col = i == 1 })
	end
end

local function cupcakeHouse(ctx: Ctx, x: number, z: number, s: number, wrap: string, frost: string, yaw: number)
	-- moule cannelé
	local n = 14
	for i = 0, n - 1 do
		local a = 2 * math.pi * i / n
		box(ctx, s * 0.42, s * 0.9, s * 0.2, x + math.cos(a) * s * 0.62, s * 0.45, z + math.sin(a) * s * 0.62, if i % 2 == 0 then wrap else "FFFFFF", { r = { 0, -math.deg(a) + 90, 0 }, col = true })
	end
	disc(ctx, s * 1.3, s * 0.9, x, s * 0.45, z, wrap)
	-- glaçage en boules
	for k = 0, 2 do
		local rr = s * (0.62 - k * 0.2)
		local m = 9 - k * 3
		for i = 0, m - 1 do
			local a = 2 * math.pi * i / m + k
			ball(ctx, s * (0.55 - k * 0.1), x + math.cos(a) * rr, s * (1.0 + k * 0.3), z + math.sin(a) * rr, frost)
		end
	end
	ball(ctx, s * 0.32, x, s * 1.85, z, "E8344E")
	-- porte et fenêtres lumineuses
	local ry = math.rad(yaw)
	local fx, fz = math.sin(ry), math.cos(ry)
	box(ctx, s * 0.28, s * 0.46, 0.3, x + fx * s * 0.72, s * 0.23, z + fz * s * 0.72, "7A4E36", { r = { 0, yaw, 0 } })
	for _, side in { -1, 1 } do
		local ox, oz = math.cos(ry) * side * s * 0.4, -math.sin(ry) * side * s * 0.4
		box(ctx, s * 0.18, s * 0.18, 0.3, x + fx * s * 0.6 + ox, s * 0.58, z + fz * s * 0.6 + oz, "FFE27A", { r = { 0, yaw + side * 30, 0 }, m = "Neon" })
	end
end

local function donut(ctx: Ctx, x: number, z: number, R: number, dough: string, icing: string)
	local n = 14
	for i = 0, n - 1 do
		local a = 2 * math.pi * i / n
		local cx, cy = x + math.cos(a) * R, R + 0.6 * R + math.sin(a) * R
		ball(ctx, R * 0.85, cx, cy, z, dough, { col = i == 0 })
		ball(ctx, R * 0.62, cx, cy, z - R * 0.25, icing)
	end
	for i = 1, 10 do
		local a = rand(ctx, 0, 2 * math.pi)
		box(ctx, R * 0.25, R * 0.08, R * 0.08, x + math.cos(a) * R, 1.6 * R + math.sin(a) * R, z - R * 0.6, pick(ctx, { "FF5A8A", "7FD6FF", "FFD54A", "FFFFFF", "7EE0B8" }), { r = { 0, 0, rand(ctx, 0, 180) } })
	end
end

local function lamp(ctx: Ctx, x: number, z: number, c: string)
	pole(ctx, 0.7, 9, x, 0, z, "FFFFFF", { col = true })
	ball(ctx, 2.4, x, 9.8, z, c, { m = "Neon", light = 18 })
	disc(ctx, 2.8, 0.4, x, 8.9, z, "FFD54A")
end

local function fenceRow(ctx: Ctx, x0: number, z0: number, x1: number, z1: number, step: number, c: string)
	local len = math.sqrt((x1 - x0) ^ 2 + (z1 - z0) ^ 2)
	local n = math.floor(len / step)
	local yaw = math.deg(math.atan2(-(z1 - z0), x1 - x0))
	for i = 0, n do
		local u = i / math.max(1, n)
		local x, z = x0 + (x1 - x0) * u, z0 + (z1 - z0) * u
		pole(ctx, 1.1, 4.5, x, 0, z, if i % 2 == 0 then c else "FFFFFF", { col = true })
		ball(ctx, 1.4, x, 4.8, z, if i % 2 == 0 then "FFFFFF" else c)
	end
	for _, y in { 1.6, 3.4 } do
		add(ctx, "block", { len, 0.5, 0.5 }, { (x0 + x1) / 2, y, (z0 + z1) / 2 }, "FFF6E6", { r = { 0, yaw, 0 } })
	end
end

local function cloud(ctx: Ctx, x: number, y: number, z: number, s: number, c: string)
	for i = 1, 6 do
		ball(ctx, s * rand(ctx, 0.5, 0.9), x + rand(ctx, -s, s), y + rand(ctx, -s * 0.15, s * 0.2), z + rand(ctx, -s * 0.4, s * 0.4), c, { m = "Sand" })
	end
end

local function hill(ctx: Ctx, x: number, z: number, s: number, c: string, cap: string?)
	ball(ctx, s, x, -s * 0.22, z, c, { col = true })
	if cap then
		ball(ctx, s * 0.55, x, s * 0.2, z, cap)
	end
end

local function sprinkles(ctx: Ctx, x0: number, x1: number, z0: number, z1: number, n: number, cols: { string })
	for _ = 1, n do
		box(ctx, rand(ctx, 1.6, 2.8), 0.12, 0.5, rand(ctx, x0, x1), 0.08, rand(ctx, z0, z1), pick(ctx, cols), { r = { 0, rand(ctx, 0, 180), 0 } })
	end
end

local function flowerPatch(ctx: Ctx, x: number, z: number, cols: { string })
	for _ = 1, 5 do
		local fx, fz = x + rand(ctx, -3, 3), z + rand(ctx, -3, 3)
		pole(ctx, 0.25, 1.4, fx, 0, fz, "3DBE5C")
		ball(ctx, 1.1, fx, 1.6, fz, pick(ctx, cols))
	end
end

-- Chocolat
local function chocoBar(ctx: Ctx, x: number, z: number, s: number, yaw: number)
	box(ctx, s * 1.6, s * 0.35, s, x, s * 0.17, z, "5A3424", { r = { 0, yaw, 0 }, col = true })
	local ry = math.rad(yaw)
	for i = -1, 1 do
		for j = 0, 1 do
			local lx, lz = i * s * 0.5, (j - 0.5) * s * 0.48
			box(ctx, s * 0.42, s * 0.12, s * 0.4, x + math.cos(ry) * lx + math.sin(ry) * lz, s * 0.4, z - math.sin(ry) * lx + math.cos(ry) * lz, "6B4430", { r = { 0, yaw, 0 } })
		end
	end
	-- papier doré déchiré
	box(ctx, s * 0.6, s * 0.4, s * 1.05, x - math.cos(ry) * s * 0.55, s * 0.2, z + math.sin(ry) * s * 0.55, "E8B64A", { r = { 0, yaw, 0 }, m = "Foil" })
end

local function truffleTree(ctx: Ctx, x: number, z: number, h: number)
	pole(ctx, h * 0.1, h * 0.65, x, 0, z, "8A5A3A", { col = true })
	for i = 1, 4 do
		local d = h * rand(ctx, 0.3, 0.42)
		ball(ctx, d, x + rand(ctx, -h * 0.2, h * 0.2), h * 0.7 + rand(ctx, -h * 0.05, h * 0.2), z + rand(ctx, -h * 0.2, h * 0.2), pick(ctx, { "4A2C20", "5A3424", "3A2214" }))
	end
	for _ = 1, 8 do
		box(ctx, 0.9, 0.25, 0.25, x + rand(ctx, -h * 0.3, h * 0.3), h * rand(ctx, 0.75, 1.05), z + rand(ctx, -h * 0.3, h * 0.3), pick(ctx, { "FF5A8A", "FFD54A", "FFFFFF", "7FD6FF" }), { r = { rand(ctx, 0, 90), rand(ctx, 0, 180), 0 } })
	end
end

local function cookie(ctx: Ctx, x: number, z: number, s: number)
	add(ctx, "cyl", { s * 0.25, s, s }, { x, s * 0.5, z }, "D9A066", { r = { 0, rand(ctx, 0, 180), rand(ctx, -15, 15) }, col = true })
	for _ = 1, 6 do
		ball(ctx, s * 0.12, x + rand(ctx, -s * 0.3, s * 0.3), s * rand(ctx, 0.25, 0.75), z - s * 0.14, "4A2C20")
	end
end

local function chocoFountain(ctx: Ctx, x: number, z: number)
	disc(ctx, 22, 1.4, x, 0.7, z, "E8B64A", { col = true })
	disc(ctx, 20, 1.2, x, 1.3, z, "6B4430", { m = "Glass", t = 0.1 })
	for k = 0, 2 do
		pole(ctx, 3 - k * 0.6, 4, x, 1.5 + k * 4, z, "FFF6E6", { col = true })
		disc(ctx, 12 - k * 3.5, 0.8, x, 5.6 + k * 4, z, "E8B64A")
		disc(ctx, 11 - k * 3.5, 0.6, x, 5.9 + k * 4, z, "5A3424")
	end
	ball(ctx, 2.6, x, 18.4, z, "5A3424", { fx = "bubbles" })
end

-- Glace
local function iceCone(ctx: Ctx, x: number, z: number, h: number, cols: { string })
	local n = 6
	for i = 0, n - 1 do
		local d = h * 0.06 + h * 0.3 * (i / n)
		pole(ctx, d, h * 0.6 / n, x, i * h * 0.6 / n, z, if i % 2 == 0 then "E8A85A" else "D9954A", { col = i == 0 })
	end
	for i = 1, 3 do
		ball(ctx, h * (0.36 - i * 0.04), x, h * 0.6 + (i - 1) * h * 0.25, z, pick(ctx, cols))
	end
	ball(ctx, h * 0.1, x, h * 1.22, z, "E8344E")
end

local function popsicle(ctx: Ctx, x: number, z: number, h: number, c: string)
	box(ctx, h * 0.16, h * 0.45, h * 0.06, x, h * 0.22, z, "E8C9A0", { col = true })
	box(ctx, h * 0.5, h * 0.55, h * 0.28, x, h * 0.7, z, c)
	add(ctx, "cyl", { h * 0.28, h * 0.5, h * 0.5 }, { x, h * 0.98, z }, c, { r = { 0, 90, 0 } })
end

local function crystal(ctx: Ctx, x: number, z: number, h: number, c: string, neon: boolean)
	for i = 1, 3 do
		local hh = h * rand(ctx, 0.5, 1)
		box(ctx, h * 0.18, hh, h * 0.18, x + rand(ctx, -h * 0.15, h * 0.15), hh * 0.45, z + rand(ctx, -h * 0.15, h * 0.15), c, { r = { rand(ctx, -18, 18), rand(ctx, 0, 90), rand(ctx, -18, 18) }, m = if neon then "Neon" else "Glass", t = if neon then 0.15 else 0.35, col = i == 1 })
	end
end

-- Galaxie
local function planet(ctx: Ctx, x: number, y: number, z: number, d: number, c: string, ring: string)
	ball(ctx, d, x, y, z, c)
	add(ctx, "cyl", { 0.3, d * 1.8, d * 1.8 }, { x, y, z }, ring, { r = { 0, rand(ctx, 0, 180), 70 }, t = 0.3, m = "Neon" })
end

local function star(ctx: Ctx, x: number, y: number, z: number, s: number, c: string)
	for i = 0, 4 do
		add(ctx, "block", { s * 0.28, s, s * 0.2 }, { x, y, z }, c, { r = { 0, 0, i * 72 }, m = "Neon" })
	end
end

local function ufo(ctx: Ctx, x: number, y: number, z: number)
	disc(ctx, 14, 1.6, x, y, z, "C9C0FF", { m = "Metal" })
	ball(ctx, 6, x, y + 1.6, z, "7FD6FF", { m = "Glass", t = 0.3 })
	for i = 0, 7 do
		local a = i * math.pi / 4
		ball(ctx, 1, x + math.cos(a) * 6.4, y - 0.4, z + math.sin(a) * 6.4, "FFE27A", { m = "Neon" })
	end
end

---------------------------------------------------------------------------
-- Disposition par monde
---------------------------------------------------------------------------
local function inField(x: number, z: number, pad: number): boolean
	return math.abs(x) < FX + pad and z > Z0 - pad and z < Z1 + pad
end
local function inPlaza(x: number, z: number): boolean
	return math.abs(x) < 160 and z < -70 and z > -165
end

-- points libres dans l'île, hors champ et place
local function freeSpot(ctx: Ctx, margin: number): (number, number)
	for _ = 1, 60 do
		local x, z = rand(ctx, -195, 195), rand(ctx, -165, 165)
		if not inField(x, z, margin) and not inPlaza(x, z) then
			return x, z
		end
	end
	return 180, 160
end

-- point de l'anneau extérieur (paysage autour de l'île)
local function ringSpot(ctx: Ctx, r0: number, r1: number): (number, number)
	local a = rand(ctx, 0, 2 * math.pi)
	local r = rand(ctx, r0, r1)
	return math.cos(a) * r * 1.1, math.sin(a) * r
end

function Decor.build(theme: string, palette: { string }, seed: number): { Spec }
	local state = seed % 2147483647
	if state <= 0 then
		state += 2147483646
	end
	local ctx: Ctx = {
		out = {},
		rnd = function(): number
			state = (state * 16807) % 2147483647
			return state / 2147483647
		end,
	}
	local P = palette

	-- sol extérieur (évite le vide au bord de l'île) et collines de fond
	local outer = { meadow = "B8F0C8", choco = "8A5A3A", ice = "EAF7FF", galaxy = "1B1638" }
	box(ctx, 700, 2, 700, 0, -3.2, 0, outer[theme] or "B8F0C8", { m = if theme == "ice" then "Snow" else "SmoothPlastic" })

	if theme == "meadow" then
		-- fond : collines arc-en-ciel, sucettes et cannes géantes
		for _ = 1, 16 do
			local x, z = ringSpot(ctx, 250, 320)
			hill(ctx, x, z, rand(ctx, 50, 90), pick(ctx, { "8EDDB4", "A6E8C4", "FFB3CF", "B69CFF" }), "FFFFFF")
		end
		for _ = 1, 10 do
			local x, z = ringSpot(ctx, 225, 300)
			if ctx.rnd() < 0.5 then
				lollipop(ctx, x, z, rand(ctx, 35, 55), pick(ctx, P), pick(ctx, { "FFFFFF", "FFF3B8" }))
			else
				candyCane(ctx, x, z, rand(ctx, 35, 55), rand(ctx, 0, 360), "FF5A6E")
			end
		end
		-- île : maisons cupcake, arbres, buissons, sucettes
		for i = 1, 9 do
			local x, z = freeSpot(ctx, 22)
			cupcakeHouse(ctx, x, z, rand(ctx, 9, 13), pick(ctx, P), pick(ctx, { "FFFFFF", "FFE3EE", "E3F6FF" }), math.deg(math.atan2(-x, -z)))
		end
		for _ = 1, 44 do
			local x, z = freeSpot(ctx, 10)
			local k = ctx.rnd()
			if k < 0.35 then
				gumdropTree(ctx, x, z, rand(ctx, 11, 17), P)
			elseif k < 0.6 then
				cottonTree(ctx, x, z, rand(ctx, 11, 16), pick(ctx, { "FFB3D1", "BDE9FF", "E2D8FF" }))
			elseif k < 0.8 then
				lollipop(ctx, x, z, rand(ctx, 10, 16), pick(ctx, P), "FFFFFF")
			else
				candyCane(ctx, x, z, rand(ctx, 10, 15), rand(ctx, 0, 360), "FF5A6E")
			end
		end
		for _ = 1, 30 do
			local x, z = freeSpot(ctx, 4)
			bush(ctx, x, z, rand(ctx, 3, 5), { "8EDDB4", "A6E8C4", "FFB3CF" })
		end
		for _ = 1, 24 do
			local x, z = freeSpot(ctx, 2)
			flowerPatch(ctx, x, z, { "FF5A8A", "FFD54A", "FFFFFF", "B69CFF" })
		end
		donut(ctx, -175, -40, 9, "E8A85A", "FF8FB8")
		donut(ctx, 176, 60, 8, "E8A85A", "7FD6FF")
		for _ = 1, 10 do
			cloud(ctx, rand(ctx, -300, 300), rand(ctx, 70, 110), rand(ctx, -300, 300), rand(ctx, 10, 18), "FFFFFF")
		end
	elseif theme == "choco" then
		for _ = 1, 16 do
			local x, z = ringSpot(ctx, 250, 320)
			hill(ctx, x, z, rand(ctx, 50, 90), pick(ctx, { "5A3424", "6B4430", "4A2C20" }), pick(ctx, { "F3DCC2", "FFFFFF", "FF8FB8" }))
		end
		for _ = 1, 8 do
			local x, z = ringSpot(ctx, 225, 290)
			truffleTree(ctx, x, z, rand(ctx, 30, 45))
		end
		-- rivière de chocolat derrière le champ
		box(ctx, 380, 0.3, 14, 0, 0.12, 157, "5A3424", { m = "Glass", t = 0.05 })
		for i = -4, 4 do
			box(ctx, 16, 1.2, 4, i * 42, 0.6, 157, "D9A066", { col = true })
		end
		chocoFountain(ctx, -178, 40)
		chocoFountain(ctx, 178, -30)
		for _ = 1, 12 do
			local x, z = freeSpot(ctx, 20)
			chocoBar(ctx, x, z, rand(ctx, 8, 12), rand(ctx, 0, 180))
		end
		for _ = 1, 38 do
			local x, z = freeSpot(ctx, 10)
			if ctx.rnd() < 0.6 then
				truffleTree(ctx, x, z, rand(ctx, 11, 17))
			else
				cookie(ctx, x, z, rand(ctx, 7, 11))
			end
		end
		for _ = 1, 24 do
			local x, z = freeSpot(ctx, 4)
			bush(ctx, x, z, rand(ctx, 3, 5), { "6B4430", "8A5A3A", "F3DCC2" })
		end
		for _ = 1, 10 do
			cloud(ctx, rand(ctx, -300, 300), rand(ctx, 70, 110), rand(ctx, -300, 300), rand(ctx, 10, 18), "F3DCC2")
		end
	elseif theme == "ice" then
		for _ = 1, 16 do
			local x, z = ringSpot(ctx, 250, 320)
			hill(ctx, x, z, rand(ctx, 50, 95), pick(ctx, { "FFFFFF", "E6F7FF", "D6F0FF" }), pick(ctx, P))
		end
		for _ = 1, 10 do
			local x, z = ringSpot(ctx, 225, 290)
			iceCone(ctx, x, z, rand(ctx, 32, 48), P)
		end
		for _ = 1, 44 do
			local x, z = freeSpot(ctx, 10)
			local k = ctx.rnd()
			if k < 0.4 then
				iceCone(ctx, x, z, rand(ctx, 11, 16), P)
			elseif k < 0.7 then
				popsicle(ctx, x, z, rand(ctx, 9, 14), pick(ctx, P))
			else
				crystal(ctx, x, z, rand(ctx, 8, 14), "BDE9FF", false)
			end
		end
		for _ = 1, 30 do
			local x, z = freeSpot(ctx, 4)
			hill(ctx, x, z, rand(ctx, 5, 9), "FFFFFF")
		end
		for _ = 1, 10 do
			cloud(ctx, rand(ctx, -300, 300), rand(ctx, 70, 110), rand(ctx, -300, 300), rand(ctx, 10, 18), "FFFFFF")
		end
		add(ctx, "block", { 1, 1, 1 }, { 0, 60, 0 }, "FFFFFF", { t = 1, fx = "snow" })
	else -- galaxy
		for _ = 1, 12 do
			local x, z = ringSpot(ctx, 250, 330)
			planet(ctx, x, rand(ctx, 40, 110), z, rand(ctx, 22, 50), pick(ctx, P), pick(ctx, { "FFF3B8", "7FD6FF", "FF8FB8" }))
		end
		for _ = 1, 14 do
			local x, z = ringSpot(ctx, 230, 300)
			crystal(ctx, x, z, rand(ctx, 28, 45), pick(ctx, P), true)
		end
		for _ = 1, 40 do
			local x, z = freeSpot(ctx, 10)
			if ctx.rnd() < 0.6 then
				crystal(ctx, x, z, rand(ctx, 8, 15), pick(ctx, P), true)
			else
				hill(ctx, x, z, rand(ctx, 6, 11), pick(ctx, { "3F3670", "2E2752", "4B3E86" }))
			end
		end
		for _ = 1, 26 do
			star(ctx, rand(ctx, -320, 320), rand(ctx, 40, 140), rand(ctx, -320, 320), rand(ctx, 4, 9), pick(ctx, { "FFE27A", "FFF3B8", "7FD6FF" }))
		end
		ufo(ctx, -120, 55, 120)
		ufo(ctx, 140, 70, -60)
		add(ctx, "block", { 1, 1, 1 }, { 0, 30, 0 }, "FFFFFF", { t = 1, fx = "stars" })
	end

	-- commun : clôture autour du champ (ouverte devant et derrière), lampadaires, paillettes au sol
	local fc = P[1]
	local fx, z0, z1 = FX + 6, Z0 - 6, Z1 + 6
	fenceRow(ctx, -fx, z0, -fx, z1, 6, fc)
	fenceRow(ctx, fx, z0, fx, z1, 6, fc)
	fenceRow(ctx, -fx, z1, -24, z1, 6, fc)
	fenceRow(ctx, 24, z1, fx, z1, 6, fc)
	fenceRow(ctx, -fx, z0, -24, z0, 6, fc)
	fenceRow(ctx, 24, z0, fx, z0, 6, fc)
	for _, x in { -150, -90, -60, 60, 90, 150 } do
		lamp(ctx, x, -82, P[(math.abs(x) // 30) % #P + 1])
	end
	for _, z in { -40, 10, 60, 110 } do
		lamp(ctx, -fx - 6, z, P[2])
		lamp(ctx, fx + 6, z, P[3])
	end
	-- arches d'entrée du champ (devant et derrière)
	for _, z in { z0, z1 } do
		for _, x in { -22, 22 } do
			pole(ctx, 2.2, 16, x, 0, z, "FFFFFF", { col = true })
			ball(ctx, 3.4, x, 16.8, z, P[2])
		end
		box(ctx, 46, 3, 2.4, 0, 15, z, P[1])
		for i = -3, 3 do
			ball(ctx, 1.6, i * 6, 17.2, z, P[(i + 4) % #P + 1], { m = "Neon" })
		end
	end
	sprinkles(ctx, -FX + 2, FX - 2, Z0 + 2, Z1 - 2, 220, P)
	-- chemin du point d'apparition jusqu'à la place
	local pathC = { meadow = "FFF6E6", choco = "F3DCC2", ice = "FFFFFF", galaxy = "4B3E86" }
	box(ctx, 14, 0.16, 104, 0, 0.13, -22, pathC[theme] or "FFF6E6")
	for i = 0, 12 do
		for _, sx in { -7.5, 7.5 } do
			ball(ctx, 1.4, sx, 0.3, -72 + i * 8.4, P[i % #P + 1])
		end
	end
	disc(ctx, 26, 0.2, 0, 0.14, 30, pathC[theme] or "FFF6E6")
	disc(ctx, 28, 0.15, 0, 0.12, 30, P[1])
	-- bosquets dans le champ
	for _, g in Decor.GROVES do
		local gx, gz = g[1], g[2]
		disc(ctx, Decor.GROVE_R * 2, 0.25, gx, 0.14, gz, if theme == "galaxy" then "3F3670" elseif theme == "choco" then "6B4430" elseif theme == "ice" then "FFFFFF" else "A6E8C4")
		for k = 1, 3 do
			local a = k * 2.1 + gx
			local x, z = gx + math.cos(a) * 5, gz + math.sin(a) * 5
			if theme == "meadow" then
				if k == 1 then lollipop(ctx, x, z, 13, pick(ctx, P), "FFFFFF") else gumdropTree(ctx, x, z, rand(ctx, 10, 14), P) end
			elseif theme == "choco" then
				if k == 1 then cookie(ctx, x, z, 8) else truffleTree(ctx, x, z, rand(ctx, 10, 14)) end
			elseif theme == "ice" then
				if k == 1 then popsicle(ctx, x, z, 11, pick(ctx, P)) else iceCone(ctx, x, z, rand(ctx, 10, 13), P) end
			else
				crystal(ctx, x, z, rand(ctx, 9, 13), pick(ctx, P), true)
			end
		end
		for k = 0, 7 do
			local a = k / 8 * 2 * math.pi
			bush(ctx, gx + math.cos(a) * 11.5, gz + math.sin(a) * 11.5, 2.4, if theme == "galaxy" then { "4B3E86", "2E2752" } elseif theme == "choco" then { "8A5A3A", "F3DCC2" } elseif theme == "ice" then { "FFFFFF", "D6F0FF" } else { "8EDDB4", "FFB3CF" })
		end
	end
	-- étincelles dans l'air au-dessus du champ
	add(ctx, "block", { 1, 1, 1 }, { 0, 8, 35 }, "FFFFFF", { t = 1, fx = "sparkle" })
	return ctx.out
end

-- Petite scène de vitrine d'un monde (vignettes du menu des mondes), centrée sur l'origine
function Decor.diorama(theme: string, palette: { string }): { Spec }
	local state = 12345
	local ctx: Ctx = {
		out = {},
		rnd = function(): number
			state = (state * 16807) % 2147483647
			return state / 2147483647
		end,
	}
	local P = palette
	local groundC = { meadow = "FFB3CF", choco = "CC9E74", ice = "D6F0FF", galaxy = "3F3670" }
	disc(ctx, 60, 2, 0, -1, 0, groundC[theme] or "FFB3CF")
	disc(ctx, 64, 1.6, 0, -1.4, 0, P[1])
	-- tas de bonbons au premier plan
	for i = 1, 4 do
		local x, z = -14 + i * 6 + rand(ctx, -2, 2), -10 + rand(ctx, -3, 3)
		for _ = 1, 3 do
			ball(ctx, rand(ctx, 2.6, 3.6), x + rand(ctx, -1.2, 1.2), 1.2, z + rand(ctx, -1.2, 1.2), pick(ctx, P))
		end
	end
	if theme == "meadow" then
		cupcakeHouse(ctx, -12, 8, 8, P[2], "FFFFFF", 160)
		lollipop(ctx, 6, 10, 13, P[1], "FFFFFF")
		candyCane(ctx, 16, 2, 12, 200, "FF5A6E")
		gumdropTree(ctx, 0, 14, 11, P)
		cottonTree(ctx, -22, -2, 10, "BDE9FF")
		cloud(ctx, 10, 24, 16, 6, "FFFFFF")
	elseif theme == "choco" then
		chocoFountain(ctx, 0, 10)
		truffleTree(ctx, -14, 6, 12)
		truffleTree(ctx, 15, 8, 11)
		chocoBar(ctx, 18, -4, 6, 30)
		cookie(ctx, -20, -4, 6)
	elseif theme == "ice" then
		iceCone(ctx, -10, 8, 14, P)
		iceCone(ctx, 10, 10, 12, P)
		popsicle(ctx, 0, 14, 11, P[2])
		crystal(ctx, 18, 0, 9, "BDE9FF", false)
		hill(ctx, -20, -2, 8, "FFFFFF")
		cloud(ctx, -6, 24, 16, 6, "FFFFFF")
	else
		planet(ctx, 0, 20, 14, 10, P[3], "FFF3B8")
		crystal(ctx, -12, 6, 12, P[1], true)
		crystal(ctx, 13, 8, 11, P[4], true)
		star(ctx, -16, 20, 8, 4, "FFE27A")
		star(ctx, 18, 22, 6, 3, "7FD6FF")
		ufo(ctx, 16, 14, -2)
	end
	return ctx.out
end

return Decor
