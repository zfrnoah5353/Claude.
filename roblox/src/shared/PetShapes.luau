--!nonstrict
-- Plans 3D des pets, en Luau pur (aucune API Roblox) : chaque espèce est
-- décrite comme une liste de pièces (bloc, boule, ellipsoïde, cylindre) avec
-- position et rotation. PetModels transforme ces plans en vraies pièces Roblox ;
-- le même code sert à exporter les modèles et à générer des aperçus.
--
-- Repère : X à droite, Y en haut, le pet regarde vers -Z. Le sol est à y = -1.1.

local Shapes = {}

---------------------------------------------------------------------------
-- Maths (matrices 3x3 en ligne)
---------------------------------------------------------------------------
local I = { 1, 0, 0, 0, 1, 0, 0, 0, 1 }

local function mul(a, b)
	local r = table.create(9, 0)
	for i = 0, 2 do
		for j = 0, 2 do
			local s = 0
			for k = 0, 2 do
				s += a[i * 3 + k + 1] * b[k * 3 + j + 1]
			end
			r[i * 3 + j + 1] = s
		end
	end
	return r
end

local function mv(m, v)
	return {
		m[1] * v[1] + m[2] * v[2] + m[3] * v[3],
		m[4] * v[1] + m[5] * v[2] + m[6] * v[3],
		m[7] * v[1] + m[8] * v[2] + m[9] * v[3],
	}
end

local function add(a, b)
	return { a[1] + b[1], a[2] + b[2], a[3] + b[3] }
end

local function sub(a, b)
	return { a[1] - b[1], a[2] - b[2], a[3] - b[3] }
end

local function scale(a, s)
	return { a[1] * s, a[2] * s, a[3] * s }
end

local function len(a)
	return math.sqrt(a[1] * a[1] + a[2] * a[2] + a[3] * a[3])
end

local function norm(a)
	local l = len(a)
	if l < 1e-9 then
		return { 0, 1, 0 }
	end
	return { a[1] / l, a[2] / l, a[3] / l }
end

local function cross(a, b)
	return { a[2] * b[3] - a[3] * b[2], a[3] * b[1] - a[1] * b[3], a[1] * b[2] - a[2] * b[1] }
end

-- Rotation d'Euler en degrés, même convention que CFrame.Angles (Rx * Ry * Rz)
local function euler(x, y, z)
	local cx, sx = math.cos(math.rad(x)), math.sin(math.rad(x))
	local cy, sy = math.cos(math.rad(y)), math.sin(math.rad(y))
	local cz, sz = math.cos(math.rad(z)), math.sin(math.rad(z))
	local rx = { 1, 0, 0, 0, cx, -sx, 0, sx, cx }
	local ry = { cy, 0, sy, 0, 1, 0, -sy, 0, cy }
	local rz = { cz, -sz, 0, sz, cz, 0, 0, 0, 1 }
	return mul(mul(rx, ry), rz)
end

local function toMat(rot)
	if rot == nil then
		return I
	elseif #rot == 9 then
		return rot
	end
	return euler(rot[1], rot[2], rot[3])
end

-- Matrice dont l'axe Y local pointe vers dir (pour poser un segment)
local function alongY(dir)
	local y = norm(dir)
	local ref = if math.abs(y[2]) < 0.95 then { 0, 1, 0 } else { 0, 0, 1 }
	local x = norm(cross(ref, y))
	local z = cross(x, y)
	return { x[1], y[1], z[1], x[2], y[2], z[2], x[3], y[3], z[3] }
end

Shapes.euler = euler
Shapes.mul = mul

---------------------------------------------------------------------------
-- Constructeur
---------------------------------------------------------------------------
local B = {}
B.__index = B

function Shapes.builder()
	return setmetatable({ parts = {}, stack = {}, p = { 0, 0, 0 }, r = I }, B)
end

-- Ouvre un sous-repère (position, rotation) ; pop() pour revenir.
function B:push(pos, rot)
	table.insert(self.stack, { self.p, self.r })
	self.p = add(self.p, mv(self.r, pos))
	self.r = mul(self.r, toMat(rot))
end

function B:pop()
	local f = table.remove(self.stack)
	self.p, self.r = f[1], f[2]
end

-- opt : { mat = "plastic"|"neon"|"metal"|"glass", alpha = 0..1, tag = "SpinY"|"SpinZ"|..., name = string }
function B:add(shape, size, pos, rot, color, opt)
	opt = opt or {}
	table.insert(self.parts, {
		shape = shape,
		size = { size[1], size[2], size[3] },
		pos = add(self.p, mv(self.r, pos)),
		rot = mul(self.r, toMat(rot)),
		color = color,
		mat = opt.mat or "plastic",
		alpha = opt.alpha or 0,
		tag = opt.tag,
		pivot = opt.pivot, -- centre de rotation des pièces SpinZ
		name = opt.name or shape,
	})
end

function B:box(size, pos, color, rot, opt)
	self:add("block", size, pos, rot, color, opt)
end

function B:ell(size, pos, color, rot, opt)
	self:add("ellipsoid", size, pos, rot, color, opt)
end

function B:ball(d, pos, color, opt)
	self:add("ball", { d, d, d }, pos, nil, color, opt)
end

-- Cylindre le long de l'axe Y local (comme un poteau)
function B:pole(length, d, pos, color, rot, opt)
	self:push(pos, rot)
	self:add("cyl", { length, d, d }, { 0, 0, 0 }, { 0, 0, 90 }, color, opt)
	self:pop()
end

-- Disque plat horizontal (anneau plein, bague)
function B:disc(d, thick, pos, color, rot, opt)
	self:pole(thick, d, pos, color, rot, opt)
end

-- Segment (bloc ou cylindre) entre deux points
function B:seg(a, b, d, color, shape, opt)
	local dir = sub(b, a)
	local l = len(dir)
	if l < 1e-4 then
		return
	end
	local mid = scale(add(a, b), 0.5)
	local m = alongY(dir)
	if shape == "cyl" then
		self:add("cyl", { l, d, d }, mid, mul(m, euler(0, 0, 90)), color, opt)
	elseif shape == "ell" then
		self:add("ellipsoid", { d, l * 1.25, d }, mid, m, color, opt)
	else
		self:add("block", { d, l, d }, mid, m, color, opt)
	end
end

-- Chaîne de segments passant par des points, avec un diamètre par point.
-- Renvoie la liste des points et des directions (pour ajouter piques et bagues).
function B:chain(points, diam, color, shape, opt)
	for i = 1, #points - 1 do
		local d = (diam[i] + diam[i + 1]) / 2
		self:seg(points[i], points[i + 1], d, color, shape, opt)
		if shape ~= "ell" and i > 1 then
			-- articulation arrondie pour éviter les trous
			self:ball(diam[i] * 1.02, points[i], color, opt)
		end
	end
end

-- Pique low-poly : deux losanges croisés, pointe vers +Y local
function B:spike(pos, s, color, rot, opt)
	self:push(pos, rot)
	self:box({ s, s, s * 0.45 }, { 0, 0, 0 }, color, { 0, 0, 45 }, opt)
	self:box({ s * 0.45, s, s }, { 0, 0, 0 }, color, { 45, 0, 0 }, opt)
	self:box({ s * 0.5, s * 0.5, s * 0.25 }, { 0, s * 0.62, 0 }, color, { 0, 0, 45 }, opt)
	self:pop()
end

-- Anneau de blocs dans le plan XZ local (le tourner pour un anneau vertical)
function B:ring(center, rot, radius, n, seg, color, opt)
	self:push(center, rot)
	local w = 2 * math.pi * radius / n * 1.08
	for i = 0, n - 1 do
		local a = i / n * math.pi * 2
		self:box({ seg[1] or w, seg[2], seg[3] }, { math.cos(a) * radius, 0, math.sin(a) * radius }, color, { 0, -math.deg(a) + 90, 0 }, opt)
	end
	self:pop()
end

-- Engrenage plat (dans le plan XZ local)
function B:gear(center, rot, radius, teeth, color, opt)
	self:push(center, rot)
	self:disc(radius * 2, radius * 0.35, { 0, 0, 0 }, color, nil, opt)
	self:disc(radius * 0.8, radius * 0.45, { 0, 0, 0 }, color, nil, opt)
	for i = 0, teeth - 1 do
		local a = i / teeth * math.pi * 2
		self:box({ radius * 0.4, radius * 0.33, radius * 0.4 }, { math.cos(a) * radius * 1.08, 0, math.sin(a) * radius * 1.08 }, color, { 0, -math.deg(a), 0 }, opt)
	end
	self:pop()
end

---------------------------------------------------------------------------
-- Éléments communs
---------------------------------------------------------------------------
local BLACK = "2B1B3A"
local WHITE = "FFFFFF"
local CHEEK = "FF8FB0"
local INNER = "FFB3CF"
local GOLD = "F2C14E"
local GOLD_DARK = "C9932E"

-- Visage mignon : yeux, reflets, joues, bouche. z = surface avant.
local function cuteFace(b, y, z, w, c)
	for _, s in { -1, 1 } do
		if c.glow then
			b:ell({ 0.3, 0.3, 0.12 }, { w * s, y, z }, c.glow, nil, { mat = "neon" })
		else
			b:ell({ 0.26, 0.34, 0.14 }, { w * s, y, z }, BLACK)
			b:ell({ 0.09, 0.11, 0.05 }, { w * s - 0.05, y + 0.08, z - 0.06 }, WHITE)
		end
		b:ell({ 0.3, 0.16, 0.06 }, { (w + 0.27) * s, y - 0.2, z + 0.08 }, CHEEK, nil, { alpha = 0.15 })
	end
	b:ell({ 0.22, 0.07, 0.06 }, { 0, y - 0.22, z - 0.01 }, BLACK)
end

-- Yeux féroces lumineux (créatures mythiques)
local function fierceEyes(b, y, z, w, color, tilt)
	for _, s in { -1, 1 } do
		b:box({ 0.26, 0.11, 0.06 }, { w * s, y, z }, color, { 0, 0, (tilt or 15) * s }, { mat = "neon" })
		b:box({ 0.3, 0.05, 0.07 }, { w * s, y + 0.1, z - 0.01 }, BLACK, { 0, 0, (tilt or 15) * s + 8 * s })
	end
end

-- Tête et corps « chibi » partagés par les pets normaux
local function chibi(b, c, headSize)
	local hs = headSize or { 1.75, 1.5, 1.55 }
	b:ell({ 1.25, 1.0, 1.15 }, { 0, -0.6, 0.15 }, c.body, nil, { name = "Body" })
	b:ell({ 0.8, 0.6, 0.45 }, { 0, -0.62, -0.33 }, c.belly)
	b:ell(hs, { 0, 0.35, 0 }, c.body, nil, { name = "Body" })
	for _, s in { -1, 1 } do
		b:ell({ 0.48, 0.28, 0.72 }, { 0.38 * s, -1.0, -0.22 }, c.body, nil, { name = "Body" })
		b:ell({ 0.3, 0.12, 0.2 }, { 0.38 * s, -1.0, -0.56 }, c.belly)
	end
end

local function pointEars(b, c, x, y, s0)
	for _, s in { -1, 1 } do
		b:push({ x * s, y, 0.02 }, { 0, 0, -14 * s })
		b:box({ s0, s0, 0.3 }, { 0, 0, 0 }, c.body, { 0, 0, 45 }, { name = "Body" })
		b:box({ s0 * 0.55, s0 * 0.55, 0.1 }, { 0, -0.02, -0.15 }, c.inner or INNER, { 0, 0, 45 })
		b:pop()
	end
end

---------------------------------------------------------------------------
-- Espèces normales (low-poly simple)
---------------------------------------------------------------------------
local species = {}

species.bunny = function(b, c)
	chibi(b, c)
	for _, s in { -1, 1 } do
		b:push({ 0.36 * s, 1.0, 0.1 }, { 0, 0, -8 * s })
		b:ell({ 0.42, 1.35, 0.3 }, { 0, 0.6, 0 }, c.body, nil, { name = "Body" })
		b:ell({ 0.2, 0.95, 0.1 }, { 0, 0.6, -0.14 }, c.inner or INNER)
		b:pop()
	end
	b:ball(0.55, { 0, -0.55, 0.75 }, c.belly)
	cuteFace(b, 0.3, -0.72, 0.34, c)
end

species.cat = function(b, c)
	chibi(b, c, { 1.85, 1.45, 1.55 })
	pointEars(b, c, 0.52, 0.95, 0.6)
	b:chain({ { 0, -0.7, 0.6 }, { 0.2, -0.45, 1.0 }, { 0.35, -0.05, 1.1 }, { 0.3, 0.3, 0.98 } }, { 0.3, 0.27, 0.24, 0.2 }, c.body, "cyl", { name = "Body" })
	b:ball(0.26, { 0.3, 0.32, 0.98 }, c.belly)
	for _, s in { -1, 1 } do
		for k = -1, 1, 2 do
			b:box({ 0.45, 0.03, 0.03 }, { 0.62 * s, 0.08 + k * 0.05, -0.68 }, BLACK, { 0, 0, k * 8 * s })
		end
	end
	cuteFace(b, 0.32, -0.72, 0.36, c)
end

species.fox = function(b, c)
	chibi(b, c, { 1.8, 1.45, 1.5 })
	pointEars(b, c, 0.5, 1.0, 0.68)
	b:ell({ 0.62, 0.42, 0.55 }, { 0, 0.02, -0.72 }, c.belly)
	b:ball(0.17, { 0, 0.1, -1.0 }, BLACK)
	b:push({ 0, -0.45, 0.85 }, { 35, 0, 0 })
	b:ell({ 0.7, 1.2, 0.7 }, { 0, 0.45, 0 }, c.body, nil, { name = "Body" })
	b:ell({ 0.45, 0.45, 0.45 }, { 0, 1.0, 0 }, c.belly)
	b:pop()
	cuteFace(b, 0.38, -0.7, 0.4, c)
end

species.pup = function(b, c)
	chibi(b, c)
	for _, s in { -1, 1 } do
		b:ell({ 0.45, 0.95, 0.32 }, { 0.88 * s, 0.25, 0.02 }, c.dark, { 0, 0, 16 * s })
	end
	b:ell({ 0.66, 0.42, 0.42 }, { 0, 0.02, -0.68 }, c.belly)
	b:ell({ 0.22, 0.15, 0.12 }, { 0, 0.14, -0.9 }, BLACK)
	b:ring({ 0, -0.2, 0.05 }, nil, 0.6, 14, { nil, 0.16, 0.12 }, "FF5A6E")
	b:ball(0.2, { 0, -0.32, -0.62 }, GOLD, { mat = "metal" })
	b:chain({ { 0, -0.55, 0.65 }, { 0, -0.25, 0.95 }, { 0, 0.05, 1.0 } }, { 0.22, 0.2, 0.16 }, c.body, "cyl")
	cuteFace(b, 0.38, -0.72, 0.38, c)
end

species.bear = function(b, c)
	chibi(b, c, { 1.85, 1.55, 1.6 })
	for _, s in { -1, 1 } do
		b:ball(0.55, { 0.6 * s, 1.0, 0.05 }, c.body, { name = "Body" })
		b:ball(0.3, { 0.6 * s, 1.0, -0.18 }, c.inner or INNER)
	end
	b:ell({ 0.7, 0.45, 0.4 }, { 0, 0.02, -0.7 }, c.belly)
	b:ell({ 0.24, 0.16, 0.12 }, { 0, 0.14, -0.9 }, BLACK)
	cuteFace(b, 0.42, -0.72, 0.4, c)
end

species.king = function(b, c)
	species.bear(b, c)
	b:ring({ 0, 1.12, 0 }, nil, 0.5, 10, { nil, 0.36, 0.12 }, GOLD, { mat = "metal" })
	for i = 0, 4 do
		local a = i / 5 * math.pi * 2 + math.pi / 2
		b:spike({ math.cos(a) * 0.5, 1.4, math.sin(a) * 0.5 }, 0.22, GOLD, nil, { mat = "metal" })
	end
	b:ball(0.18, { 0, 1.12, -0.52 }, "FF3B6B", { mat = "neon" })
	-- cape
	b:box({ 1.3, 1.1, 0.12 }, { 0, -0.45, 0.62 }, "C8102E", { -12, 0, 0 })
end

species.dragon = function(b, c)
	chibi(b, c)
	b:ell({ 0.75, 0.5, 0.6 }, { 0, 0.05, -0.7 }, c.belly)
	for _, s in { -1, 1 } do
		b:ball(0.1, { 0.15 * s, 0.12, -1.0 }, BLACK)
		b:chain({ { 0.42 * s, 0.85, 0.15 }, { 0.6 * s, 1.3, 0.45 }, { 0.66 * s, 1.55, 0.85 } }, { 0.26, 0.18, 0.08 }, c.accent, "cyl")
		-- ailes : 3 baleines + membrane
		b:push({ 0.62 * s, -0.25, 0.5 }, { 0, 25 * s, -55 * s })
		b:box({ 0.08, 1.2, 0.08 }, { 0, 0.6, 0 }, c.dark)
		b:box({ 0.06, 1.0, 0.7 }, { 0, 0.55, 0.35 }, c.belly, nil, { alpha = 0.05 })
		b:box({ 0.08, 0.9, 0.08 }, { 0, 0.45, 0.7 }, c.dark, { -20, 0, 0 })
		b:pop()
	end
	for i = 0, 3 do
		b:spike({ 0, 1.0 - i * 0.38, 0.55 + i * 0.12 }, 0.24 - i * 0.03, c.accent, { 35 + i * 15, 0, 0 })
	end
	b:chain({ { 0, -0.7, 0.6 }, { 0, -0.75, 1.1 }, { 0.15, -0.5, 1.5 } }, { 0.4, 0.28, 0.16 }, c.body, "cyl")
	b:spike({ 0.15, -0.45, 1.6 }, 0.25, c.accent, { 60, 0, 0 })
	cuteFace(b, 0.4, -0.72, 0.38, c)
end

species.unicorn = function(b, c)
	chibi(b, c, { 1.7, 1.55, 1.6 })
	b:ell({ 0.72, 0.5, 0.55 }, { 0, 0.0, -0.68 }, c.belly)
	pointEars(b, c, 0.45, 1.0, 0.42)
	-- corne torsadée
	local pts, ds = {}, {}
	for i = 0, 5 do
		local t = i / 5
		table.insert(pts, { math.sin(t * 9) * 0.05, 0.95 + t * 0.85, -0.35 - t * 0.3 })
		table.insert(ds, 0.3 * (1 - t) + 0.05)
	end
	b:chain(pts, ds, GOLD, "cyl", { mat = "metal" })
	local mane = { "FF8FB8", "B69CFF", "7FD6FF", "7EE0B8", "FFE27A" }
	for i, col in mane do
		b:ball(0.5 - i * 0.04, { -0.45 + i * 0.05, 1.0 - i * 0.28, 0.45 + i * 0.08 }, col)
	end
	for i, col in mane do
		b:ball(0.35, { 0, -0.6 - i * 0.04, 0.75 + i * 0.15 }, col)
	end
	cuteFace(b, 0.4, -0.75, 0.36, c)
end

species.cloud = function(b, c)
	b:ell({ 1.9, 1.35, 1.5 }, { 0, 0, 0 }, c.body, nil, { name = "Body" })
	for i = 0, 6 do
		local a = i / 7 * math.pi * 2
		b:ball(0.85 + (i % 2) * 0.2, { math.cos(a) * 0.95, -0.15 + math.sin(a) * 0.45, 0.1 + math.sin(a * 2) * 0.2 }, c.body, { name = "Body" })
	end
	b:ball(1.0, { -0.35, 0.65, 0.1 }, c.belly)
	b:ball(0.85, { 0.4, 0.6, 0.15 }, c.belly)
	cuteFace(b, 0.05, -0.74, 0.32, c)
end

species.phantom = function(b, c)
	b:ell({ 1.6, 1.9, 1.5 }, { 0, 0.15, 0 }, c.body, nil, { alpha = 0.12, name = "Body" })
	for i = 0, 5 do
		local a = i / 6 * math.pi * 2
		b:ball(0.6, { math.cos(a) * 0.55, -0.85, math.sin(a) * 0.5 }, c.body, { alpha = 0.12, name = "Body" })
	end
	for _, s in { -1, 1 } do
		b:ell({ 0.35, 0.6, 0.3 }, { 0.85 * s, -0.05, -0.1 }, c.body, { 0, 0, 30 * s }, { alpha = 0.12 })
	end
	b:ring({ 0, 1.35, 0 }, { 10, 0, 0 }, 0.5, 14, { nil, 0.08, 0.1 }, "FFE27A", { mat = "neon", tag = "SpinY" })
	cuteFace(b, 0.35, -0.7, 0.32, { glow = c.glow or "B9F3FF" })
end

species.golem = function(b, c)
	b:box({ 1.8, 1.4, 1.3 }, { 0, -0.3, 0 }, c.body, nil, { name = "Body" })
	b:box({ 1.25, 0.95, 1.05 }, { 0, 0.75, -0.05 }, c.body, nil, { name = "Body" })
	b:box({ 1.0, 0.7, 0.2 }, { 0, -0.3, -0.62 }, c.belly)
	for _, s in { -1, 1 } do
		b:ball(0.45, { 0.5 * s, 1.25, 0 }, c.body)
		b:box({ 0.5, 1.05, 0.55 }, { 1.15 * s, -0.3, -0.05 }, c.body, { 0, 0, 8 * s })
		b:box({ 0.6, 0.35, 0.65 }, { 1.2 * s, -0.9, -0.1 }, c.dark)
		b:box({ 0.6, 0.45, 0.65 }, { 0.45 * s, -1.0, 0 }, c.dark)
		b:spike({ 0.8 * s, 0.45, 0.1 }, 0.35, c.dark, { 0, 0, -30 * s })
	end
	fierceEyes(b, 0.85, -0.6, 0.27, c.glow or "FFE27A", 12)
	b:box({ 0.5, 0.1, 0.06 }, { 0, 0.5, -0.59 }, BLACK)
	for i = 0, 3 do
		b:spike({ -0.45 + i * 0.3, 0.12, 0.62 }, 0.3, c.dark, { 70, 0, 0 })
	end
end

---------------------------------------------------------------------------
-- Créatures mythologiques (Mythique)
---------------------------------------------------------------------------

-- Pégase barbe-à-papa (Grèce)
species.pegasus = function(b, c)
	b:ell({ 1.15, 1.1, 2.1 }, { 0, 0, 0.2 }, c.body, nil, { name = "Body" })
	for _, x in { -0.38, 0.38 } do
		for _, z in { -0.45, 0.85 } do
			b:box({ 0.28, 1.0, 0.3 }, { x, -0.65, z }, c.body)
			b:box({ 0.34, 0.22, 0.38 }, { x, -1.12, z - 0.02 }, GOLD, nil, { mat = "metal" })
		end
	end
	b:box({ 0.55, 1.0, 0.6 }, { 0, 0.7, -0.75 }, c.body, { -30, 0, 0 })
	b:box({ 0.62, 0.6, 0.85 }, { 0, 1.3, -1.15 }, c.body, { 15, 0, 0 })
	b:box({ 0.48, 0.42, 0.45 }, { 0, 1.12, -1.6 }, c.belly, { 15, 0, 0 })
	for _, s in { -1, 1 } do
		b:spike({ 0.2 * s, 1.7, -1.0 }, 0.22, c.body, { -10, 0, -10 * s })
		b:box({ 0.08, 0.12, 0.05 }, { 0.26 * s, 1.38, -1.58 }, BLACK)
		-- grandes ailes de plumes
		b:push({ 0.5 * s, 0.45, -0.1 }, { 0, 0, -40 * s })
		for k = 0, 5 do
			b:ell({ 0.26, 2.3 - k * 0.25, 0.55 }, { 0, 1.1 - k * 0.08, k * 0.34 }, if k % 2 == 0 then WHITE else c.belly, { -k * 11, 0, 0 })
		end
		b:ell({ 0.2, 1.2, 0.4 }, { 0, 2.0, -0.05 }, c.accent, { 12, 0, 0 }, { mat = "neon", alpha = 0.3 })
		b:pop()
	end
	local mane = { "FF8FB8", "7FD6FF", "FFB3E6", "B9E8FF" }
	for i = 1, 6 do
		b:ball(0.42, { 0, 1.5 - i * 0.2, -0.95 + i * 0.12 }, mane[(i - 1) % 4 + 1])
	end
	for i = 1, 5 do
		b:ball(0.4 - i * 0.03, { 0, 0.2 - i * 0.15, 1.35 + i * 0.15 }, mane[(i - 1) % 4 + 1])
	end
	b:ring({ 0, 2.0, -1.05 }, { 10, 0, 0 }, 0.42, 12, { nil, 0.08, 0.1 }, GOLD, { mat = "neon", tag = "SpinY" })
end

-- Cerbère guimauve, chien à trois têtes (Grèce)
species.cerberus = function(b, c)
	b:ell({ 1.7, 1.3, 2.0 }, { 0, -0.2, 0.3 }, c.body, nil, { name = "Body" })
	for _, x in { -0.5, 0.5 } do
		for _, z in { -0.4, 0.9 } do
			b:box({ 0.38, 0.75, 0.4 }, { x, -0.8, z }, c.body)
			b:box({ 0.44, 0.18, 0.5 }, { x, -1.12, z - 0.05 }, c.dark)
		end
	end
	local heads = { { -0.72, 0.65, -0.75, -20 }, { 0, 0.95, -0.95, 0 }, { 0.72, 0.65, -0.75, 20 } }
	for i, h in heads do
		b:push({ h[1], h[2], h[3] }, { 0, h[4], 0 })
		b:ell({ 0.85, 0.8, 0.8 }, { 0, 0, 0 }, c.body, nil, { name = "Body" })
		b:box({ 0.45, 0.32, 0.45 }, { 0, -0.12, -0.45 }, c.belly)
		b:ball(0.13, { 0, -0.02, -0.68 }, BLACK)
		for _, s in { -1, 1 } do
			b:spike({ 0.28 * s, 0.4, 0.05 }, 0.28, c.dark, { 0, 0, -20 * s })
		end
		fierceEyes(b, 0.12, -0.38, 0.17, c.glow or "FF4FD8", 10)
		b:ring({ 0, -0.42, 0.05 }, { 15, 0, 0 }, 0.36, 10, { nil, 0.14, 0.1 }, "3B2A5A")
		for k = 0, 3 do
			local a = k / 4 * math.pi * 2
			b:spike({ math.cos(a) * 0.38, -0.42, math.sin(a) * 0.38 + 0.05 }, 0.14, GOLD, { 0, -math.deg(a), 90 }, { mat = "metal" })
		end
		b:pop()
	end
	b:chain({ { 0, -0.1, 1.2 }, { 0, 0.3, 1.6 }, { 0, 0.75, 1.75 } }, { 0.3, 0.22, 0.14 }, c.body, "cyl")
	b:ball(0.45, { 0, 0.95, 1.78 }, c.glow or "FF4FD8", { mat = "neon", alpha = 0.2 })
end

-- Sphinx praliné (Égypte)
species.sphinx = function(b, c)
	b:ell({ 1.6, 0.95, 2.4 }, { 0, -0.6, 0.4 }, c.body, nil, { name = "Body" })
	for _, s in { -1, 1 } do
		b:box({ 0.4, 0.32, 1.05 }, { 0.48 * s, -0.95, -0.85 }, c.body)
		b:box({ 0.45, 0.25, 0.25 }, { 0.48 * s, -0.98, -1.4 }, c.belly)
		b:box({ 0.35, 0.6, 0.9 }, { 0.78 * s, -0.75, 0.9 }, c.body)
	end
	b:ell({ 1.05, 1.1, 1.0 }, { 0, 0.45, -0.75 }, c.belly)
	-- némès rayé
	b:box({ 1.45, 1.1, 0.55 }, { 0, 0.62, -0.1 }, GOLD, nil, { mat = "metal" })
	for i = 0, 4 do
		b:box({ 1.47, 0.1, 0.57 }, { 0, 0.25 + i * 0.2, -0.1 }, "2C5DAA")
	end
	b:box({ 1.2, 0.3, 0.75 }, { 0, 1.05, -0.65 }, GOLD, nil, { mat = "metal" })
	b:box({ 1.22, 0.08, 0.77 }, { 0, 1.0, -0.65 }, "2C5DAA")
	for _, s in { -1, 1 } do
		b:box({ 0.3, 1.2, 0.3 }, { 0.68 * s, 0.0, -0.55 }, GOLD, { 0, 0, 6 * s }, { mat = "metal" })
		for i = 0, 4 do
			b:box({ 0.32, 0.08, 0.32 }, { 0.68 * s - 0.03 * s * (i - 2), -0.5 + i * 0.25, -0.55 }, "2C5DAA", { 0, 0, 6 * s })
		end
	end
	b:box({ 0.22, 0.5, 0.2 }, { 0, -0.25, -1.2 }, GOLD, nil, { mat = "metal" })
	b:chain({ { 0, 1.05, -1.2 }, { 0, 1.35, -1.25 }, { 0, 1.45, -1.12 } }, { 0.14, 0.12, 0.16 }, GOLD, "cyl", { mat = "metal" })
	fierceEyes(b, 0.55, -1.22, 0.24, c.glow or "5BE7FF", 5)
	b:chain({ { 0, -0.65, 1.55 }, { 0.3, -0.85, 1.95 }, { 0.6, -0.8, 2.2 } }, { 0.22, 0.17, 0.12 }, c.body, "cyl")
	b:ball(0.3, { 0.65, -0.78, 2.25 }, "2C5DAA")
end

-- Anubis cacao (Égypte)
species.anubis = function(b, c)
	b:ell({ 1.2, 1.5, 1.2 }, { 0, -0.35, 0.15 }, c.body, nil, { name = "Body" })
	b:box({ 0.75, 0.75, 0.85 }, { 0, 0.95, -0.15 }, c.body, nil, { name = "Body" })
	b:box({ 0.36, 0.36, 0.75 }, { 0, 0.82, -0.8 }, c.body)
	b:ball(0.16, { 0, 0.9, -1.18 }, BLACK)
	for _, s in { -1, 1 } do
		b:box({ 0.26, 0.95, 0.12 }, { 0.24 * s, 1.75, -0.05 }, c.body, { 0, 0, -8 * s })
		b:box({ 0.12, 0.7, 0.04 }, { 0.24 * s, 1.72, -0.12 }, GOLD, { 0, 0, -8 * s }, { mat = "metal" })
		b:box({ 0.3, 0.95, 0.35 }, { 0.42 * s, -0.95, -0.1 }, c.body)
		b:ring({ 0.62 * s, -0.25, -0.2 }, { 0, 0, 90 }, 0.2, 8, { nil, 0.12, 0.08 }, GOLD, { mat = "metal" })
	end
	fierceEyes(b, 1.02, -0.58, 0.2, c.glow or "FFD54A", 10)
	-- collier wesekh
	for k = 0, 2 do
		b:ring({ 0, 0.42 - k * 0.14, -0.05 }, { 12, 0, 0 }, 0.5 + k * 0.08, 16, { nil, 0.12, 0.14 }, if k == 1 then "2C5DAA" else GOLD, { mat = if k == 1 then "plastic" else "metal" })
	end
	-- ankh flottante
	b:push({ 1.15, 0.5, -0.3 }, nil)
	b:box({ 0.12, 0.75, 0.12 }, { 0, -0.15, 0 }, GOLD, nil, { mat = "neon", tag = "SpinY" })
	b:box({ 0.5, 0.12, 0.12 }, { 0, 0.15, 0 }, GOLD, nil, { mat = "neon", tag = "SpinY" })
	b:ring({ 0, 0.42, 0 }, { 90, 0, 0 }, 0.16, 8, { nil, 0.1, 0.08 }, GOLD, { mat = "neon", tag = "SpinY" })
	b:pop()
end

-- Fenrir lune de sang (Nordique)
species.fenrir = function(b, c)
	b:box({ 1.3, 1.1, 2.0 }, { 0, -0.1, 0.3 }, c.body, nil, { name = "Body" })
	b:ell({ 1.4, 1.35, 1.0 }, { 0, 0.05, -0.5 }, c.body, nil, { name = "Body" })
	for _, x in { -0.45, 0.45 } do
		for _, z in { -0.6, 1.0 } do
			b:box({ 0.38, 1.0, 0.42 }, { x, -0.65, z }, c.body)
			b:box({ 0.46, 0.2, 0.56 }, { x, -1.1, z - 0.06 }, c.dark)
			for k = -1, 1 do
				b:spike({ x + k * 0.13, -1.12, z - 0.36 }, 0.12, WHITE, { -80, 0, 0 })
			end
		end
	end
	-- chaînes brisées dorées
	for _, x in { -0.45, 0.45 } do
		b:ring({ x, -0.85, -0.6 }, nil, 0.3, 8, { nil, 0.1, 0.1 }, GOLD, { mat = "metal" })
	end
	b:box({ 0.9, 0.8, 0.8 }, { 0, 0.6, -0.85 }, c.body, { -30, 0, 0 })
	b:box({ 1.0, 0.85, 0.95 }, { 0, 1.0, -1.2 }, c.body, nil, { name = "Body" })
	b:box({ 0.6, 0.42, 0.78 }, { 0, 0.82, -1.9 }, c.body)
	b:box({ 0.55, 0.14, 0.65 }, { 0, 0.55, -1.82 }, c.belly)
	b:ball(0.18, { 0, 0.98, -2.3 }, BLACK)
	for k = -2, 2 do
		b:spike({ k * 0.1, 0.6, -2.12 }, 0.1, WHITE, { 180, 0, 0 })
	end
	for _, s in { -1, 1 } do
		b:spike({ 0.32 * s, 1.55, -1.05 }, 0.42, c.dark, { -10, 0, -15 * s })
	end
	fierceEyes(b, 1.1, -1.68, 0.3, c.glow or "FF2A3D", 15)
	for i = 0, 6 do
		b:spike({ 0, 1.45 - i * 0.16, -0.9 + i * 0.36 }, 0.42 - i * 0.03, if i % 2 == 0 then c.glow or "FF2A3D" else c.dark, { 25, 0, 0 }, { mat = if i % 2 == 0 then "neon" else "plastic" })
	end
	for _, s in { -1, 1 } do
		b:spike({ 0.65 * s, 0.65, -0.5 }, 0.35, c.dark, { 0, 0, -50 * s })
	end
	b:chain({ { 0, 0.2, 1.3 }, { 0, 0.75, 2.0 }, { 0, 1.25, 2.3 } }, { 0.45, 0.35, 0.2 }, c.body, "block")
	b:spike({ 0, 1.4, 2.35 }, 0.3, c.glow or "FF2A3D", { 20, 0, 0 }, { mat = "neon" })
	-- lune de sang et cristaux flottants
	b:ball(1.5, { 0, 2.6, 1.6 }, c.glow or "FF2A3D", { mat = "neon", alpha = 0.15 })
	for k = 0, 5 do
		local a = k / 6 * math.pi * 2
		b:spike({ math.cos(a) * 2.2, 0.6 + (k % 2) * 0.6, math.sin(a) * 2.2 }, 0.3, c.glow or "FF2A3D", { 0, 0, 180 * (k % 2) }, { mat = "neon", tag = "SpinY" })
	end
end

-- Mammouth d'Ymir, aux engrenages dorés (Nordique)
species.mammoth = function(b, c)
	b:ell({ 2.4, 2.0, 2.8 }, { 0, 0.25, 0.25 }, c.body, nil, { name = "Body" })
	for i = 0, 13 do
		local a = i / 14 * math.pi * 2
		b:spike({ math.cos(a) * 1.15, 0.2 + math.sin(a * 3) * 0.4, 0.3 + math.sin(a) * 1.3 }, 0.4, c.dark, { 0, -math.deg(a), -90 + math.sin(a * 2) * 20 })
	end
	b:ell({ 1.6, 1.5, 1.4 }, { 0, 0.8, -1.25 }, c.body, nil, { name = "Body" })
	for _, s in { -1, 1 } do
		b:ell({ 0.3, 1.1, 0.9 }, { 0.88 * s, 0.85, -1.0 }, c.dark, { 0, 20 * s, 10 * s })
		b:chain({ { 0.4 * s, 0.35, -1.75 }, { 0.62 * s, -0.35, -2.25 }, { 0.5 * s, -0.35, -2.85 }, { 0.3 * s, 0.05, -3.0 } }, { 0.3, 0.26, 0.2, 0.1 }, c.belly, "cyl")
		b:ring({ 0.62 * s, -0.35, -2.25 }, { 0, 0, 80 * s }, 0.17, 8, { nil, 0.12, 0.1 }, GOLD, { mat = "metal" })
		b:box({ 0.14, 0.14, 0.05 }, { 0.36 * s, 1.0, -1.93 }, c.glow or "FFE27A", nil, { mat = "neon" })
		for _, z in { -0.6, 1.0 } do
			b:pole(1.1, 0.75, { 0.72 * s, -0.6, z }, c.body)
			b:disc(0.82, 0.18, { 0.72 * s, -1.08, z }, GOLD, nil, { mat = "metal" })
		end
	end
	b:chain({ { 0, 0.55, -1.9 }, { 0, -0.15, -2.2 }, { 0, -0.75, -2.05 }, { 0, -0.95, -1.8 } }, { 0.5, 0.42, 0.34, 0.28 }, c.body, "cyl")
	-- tour d'horloge sur le dos
	b:box({ 0.7, 0.9, 0.7 }, { 0, 1.65, 0.4 }, GOLD_DARK, nil, { mat = "metal" })
	b:ball(0.4, { 0, 1.75, 0.03 }, c.glow or "FFE27A", { mat = "neon" })
	b:spike({ 0, 2.25, 0.4 }, 0.55, GOLD, nil, { mat = "metal" })
	-- auréole d'engrenages
	b:ring({ 0, 1.3, 1.5 }, { 90, 0, 0 }, 2.3, 28, { nil, 0.22, 0.32 }, GOLD, { mat = "metal" })
	b:ring({ 0, 1.3, 1.5 }, { 90, 0, 0 }, 2.0, 28, { nil, 0.1, 0.1 }, GOLD_DARK, { mat = "metal" })
	for k = 0, 3 do
		local a = k / 4 * math.pi * 2 + 0.4
		b:gear({ math.cos(a) * 2.6, 0.2 + k * 0.4, math.sin(a) * 2.6 }, { 90, math.deg(a), 0 }, 0.35, 8, GOLD, { mat = "metal", tag = "SpinY" })
	end
end

-- Griffon céleste (Cosmique)
species.griffin = function(b, c)
	b:ell({ 1.3, 1.25, 2.1 }, { 0, 0, 0.35 }, c.body, nil, { name = "Body" })
	b:ell({ 1.2, 1.3, 1.0 }, { 0, 0.35, -0.5 }, c.belly)
	b:ell({ 0.95, 0.95, 1.0 }, { 0, 1.15, -0.85 }, c.belly, nil, { name = "Body" })
	b:push({ 0, 1.05, -1.4 }, { 90, 0, 0 })
	b:spike({ 0, 0, 0 }, 0.42, GOLD, nil, { mat = "metal" })
	b:pop()
	fierceEyes(b, 1.3, -1.28, 0.25, c.glow or "7FD6FF", 18)
	for _, s in { -1, 1 } do
		b:spike({ 0.25 * s, 1.65, -0.7 }, 0.3, c.belly, { -30, 0, -15 * s })
		b:box({ 0.3, 0.9, 0.35 }, { 0.42 * s, -0.6, -0.55 }, GOLD, nil, { mat = "metal" })
		for k = -1, 1 do
			b:spike({ 0.42 * s + k * 0.1, -1.1, -0.82 }, 0.12, BLACK, { -80, 0, 0 })
		end
		b:box({ 0.36, 0.95, 0.42 }, { 0.45 * s, -0.6, 1.0 }, c.body)
		b:push({ 0.55 * s, 0.45, 0.1 }, { 0, 0, -55 * s })
		for k = 0, 5 do
			b:ell({ 0.2, 1.9 - k * 0.22, 0.42 }, { 0, 0.9 - k * 0.07, k * 0.28 }, if k % 2 == 0 then c.accent else c.dark, { -k * 9, 0, 0 })
		end
		b:pop()
	end
	b:chain({ { 0, -0.1, 1.35 }, { 0, -0.4, 1.9 }, { 0, -0.1, 2.35 } }, { 0.22, 0.18, 0.14 }, c.body, "cyl")
	b:ball(0.4, { 0, 0.05, 2.45 }, c.accent)
	for k = 0, 5 do
		local a = k / 6 * math.pi * 2
		b:ball(0.22, { math.cos(a) * 2.0, 1.2 + (k % 2) * 0.4, math.sin(a) * 2.0 }, "FFF3B8", { mat = "neon", tag = "SpinY" })
	end
end

-- Dragon céleste (long dragon de jade)
species.longdragon = function(b, c)
	local pts, ds = {}, {}
	for i = 0, 11 do
		local t = i / 11
		table.insert(pts, { math.sin(t * math.pi * 2.2) * 1.0, 1.5 - t * 1.9 + math.sin(t * math.pi * 2) * 0.45, -0.8 + t * 3.0 })
		table.insert(ds, 0.85 - t * 0.55)
	end
	b:chain(pts, ds, c.body, "cyl", { name = "Body" })
	for i = 2, 11, 2 do
		b:spike(add(pts[i], { 0, ds[i] * 0.5, 0 }), 0.3, c.accent, { 20, 0, 0 })
		b:ball(ds[i] * 0.7, add(pts[i], { 0, -ds[i] * 0.3, -0.05 }), c.belly)
	end
	for _, i in { 3, 8 } do
		for _, s in { -1, 1 } do
			b:chain({ pts[i], add(pts[i], { 0.55 * s, -0.55, -0.1 }), add(pts[i], { 0.65 * s, -0.95, -0.3 }) }, { 0.18, 0.15, 0.12 }, c.body, "cyl")
			b:spike(add(pts[i], { 0.65 * s, -1.05, -0.4 }), 0.14, GOLD, { -90, 0, 0 }, { mat = "metal" })
		end
	end
	local head = add(pts[1], { 0, 0.25, -0.7 })
	b:box({ 1.0, 0.75, 1.1 }, head, c.body, nil, { name = "Body" })
	b:box({ 0.75, 0.4, 0.7 }, add(head, { 0, -0.15, -0.75 }), c.belly)
	b:ball(0.16, add(head, { 0.18, 0.02, -1.12 }), BLACK)
	b:ball(0.16, add(head, { -0.18, 0.02, -1.12 }), BLACK)
	for k = 0, 4 do
		b:spike(add(head, { 0, 0.4 - k * 0.05, 0.4 + k * 0.3 }), 0.3, c.accent, { 40, 0, 0 })
	end
	fierceEyes(b, head[2] + 0.15, head[3] - 0.57, 0.3, c.glow or "FFE27A", 10)
	for _, s in { -1, 1 } do
		b:chain({ add(head, { 0.3 * s, 0.3, 0.2 }), add(head, { 0.5 * s, 0.85, 0.5 }), add(head, { 0.75 * s, 1.05, 0.4 }) }, { 0.14, 0.1, 0.06 }, GOLD, "cyl", { mat = "metal" })
		b:chain({ add(head, { 0.25 * s, -0.15, -0.85 }), add(head, { 0.8 * s, -0.25, -1.0 }), add(head, { 1.2 * s, -0.05, -0.8 }) }, { 0.05, 0.04, 0.03 }, GOLD, "cyl")
	end
	b:ball(0.55, add(head, { 0, -0.4, -1.4 }), "BFF8FF", { mat = "neon", alpha = 0.2, tag = "SpinY" })
end

---------------------------------------------------------------------------
-- Dieux et titans (Divin)
---------------------------------------------------------------------------

-- Hydre d'Olympe à cinq têtes (Grèce)
species.hydra = function(b, c)
	b:ell({ 2.2, 1.6, 2.4 }, { 0, -0.25, 0.35 }, c.body, nil, { name = "Body" })
	b:ell({ 1.5, 1.0, 1.6 }, { 0, -0.55, 0.0 }, c.belly)
	for _, x in { -0.75, 0.75 } do
		for _, z in { -0.4, 1.1 } do
			b:box({ 0.45, 0.6, 0.5 }, { x, -0.85, z }, c.body)
			for k = -1, 1 do
				b:spike({ x + k * 0.14, -1.12, z - 0.3 }, 0.12, GOLD, { -80, 0, 0 }, { mat = "metal" })
			end
		end
	end
	for i, x in { -1, -0.5, 0, 0.5, 1 } do
		local top = { x * 1.5, 2.1 + (1 - math.abs(x)) * 0.5, -0.8 + math.abs(x) * 0.4 }
		local pts = { { x * 0.55, 0.3, -0.45 }, { x * 1.0, 1.15, -0.75 }, top }
		b:chain(pts, { 0.5, 0.4, 0.34 }, c.body, "cyl", { name = "Body" })
		b:spike({ x * 1.0, 1.4, -0.55 }, 0.22, c.accent, { 20, 0, 0 })
		b:push(top, { 0, -x * 25, 0 })
		b:box({ 0.55, 0.48, 0.75 }, { 0, 0.05, -0.2 }, c.body, nil, { name = "Body" })
		b:box({ 0.42, 0.18, 0.5 }, { 0, -0.18, -0.55 }, c.belly)
		fierceEyes(b, 0.14, -0.58, 0.17, c.glow or "C6FF4F", 12)
		for _, s in { -1, 1 } do
			b:spike({ 0.18 * s, 0.4, 0.05 }, 0.22, GOLD, { -25, 0, -15 * s }, { mat = "metal" })
		end
		if i == 3 then
			b:ring({ 0, 0.38, -0.15 }, nil, 0.32, 10, { nil, 0.12, 0.08 }, GOLD, { mat = "neon" })
		end
		b:pop()
	end
	b:chain({ { 0, -0.2, 1.5 }, { 0.3, -0.6, 2.2 }, { 0.8, -0.8, 2.6 } }, { 0.6, 0.4, 0.2 }, c.body, "cyl")
	-- couronne de laurier divine
	b:ring({ 0, 0.1, 0.35 }, nil, 2.7, 24, { 0.35, 0.08, 0.18 }, "7EE0A0", { mat = "neon", tag = "SpinY" })
	for k = 0, 7 do
		local a = k / 8 * math.pi * 2
		b:spike({ math.cos(a) * 2.7, 0.15, 0.35 + math.sin(a) * 2.7 }, 0.3, GOLD, nil, { mat = "neon", tag = "SpinY" })
	end
end

-- Ra, phénix solaire (Égypte)
species.phoenix = function(b, c)
	b:ell({ 1.1, 1.35, 1.1 }, { 0, 0.25, 0.05 }, c.body, nil, { name = "Body" })
	b:ell({ 0.7, 0.85, 0.4 }, { 0, 0.15, -0.42 }, c.belly)
	b:ball(0.9, { 0, 1.2, -0.3 }, c.body, { name = "Body" })
	b:push({ 0, 1.12, -0.82 }, { 90, 0, 0 })
	b:spike({ 0, 0, 0 }, 0.32, GOLD, nil, { mat = "metal" })
	b:pop()
	fierceEyes(b, 1.3, -0.72, 0.2, c.glow or "FFF3B8", 15)
	for k = -2, 2 do
		b:ell({ 0.2, 0.95 - math.abs(k) * 0.15, 0.25 }, { k * 0.14, 1.95 - math.abs(k) * 0.08, -0.15 + math.abs(k) * 0.05 }, if k % 2 == 0 then "FFD23F" else "FF7A1F", { 0, 0, -k * 12 }, { mat = "neon" })
	end
	local flame = { "D8241F", "FF5A1F", "FF8A1F", "FFB020", "FFE27A" }
	for _, s in { -1, 1 } do
		b:push({ 0.45 * s, 0.6, 0.1 }, { 0, 0, -35 * s })
		for k = 1, 5 do
			b:ell({ 0.24, 2.3 - k * 0.2, 0.45 }, { 0, 1.0, (k - 3) * 0.3 }, flame[k], { -(k - 3) * 12, 0, -k * 9 * s }, { mat = if k >= 4 then "neon" else "plastic" })
		end
		b:pop()
		b:box({ 0.12, 0.6, 0.12 }, { 0.25 * s, -0.75, 0 }, GOLD, nil, { mat = "metal" })
		for k = -1, 1 do
			b:spike({ 0.25 * s + k * 0.08, -1.08, -0.1 }, 0.1, GOLD, { -80, 0, 0 }, { mat = "metal" })
		end
	end
	for k = -2, 2 do
		b:ell({ 0.22, 1.6, 0.35 }, { k * 0.22, -0.6, 0.85 }, flame[k + 3], { 55, 0, k * 14 }, { mat = if math.abs(k) <= 1 then "neon" else "plastic" })
	end
	-- disque solaire derrière
	local sun = { 0, 1.1, 0.95 }
	b:ring(sun, { 90, 0, 0 }, 2.0, 30, { nil, 0.18, 0.22 }, "FFC93C", { mat = "neon", tag = "SpinZ", pivot = sun })
	b:disc(3.6, 0.05, { 0, 1.1, 1.05 }, "FFE27A", { 90, 0, 0 }, { mat = "neon", alpha = 0.7 })
	for k = 0, 11 do
		local a = k / 12 * math.pi * 2
		b:spike({ math.cos(a) * 2.35, 1.1 + math.sin(a) * 2.35, 0.95 }, 0.35, "FFB020", { 0, 0, math.deg(a) - 90 }, { mat = "neon", tag = "SpinZ", pivot = sun })
	end
end

-- Kraken des abysses (Nordique)
species.kraken = function(b, c)
	b:ell({ 2.2, 2.6, 2.2 }, { 0, 1.55, 0.25 }, c.body, nil, { name = "Body" })
	b:ell({ 1.9, 1.1, 1.8 }, { 0, 0.4, 0.05 }, c.body, nil, { name = "Body" })
	for k = 0, 9 do
		local a = k / 10 * math.pi * 2
		b:spike({ math.cos(a) * 0.75, 2.55 + math.sin(a * 2) * 0.1, 0.25 + math.sin(a) * 0.75 }, 0.36, c.accent, { 0, -math.deg(a), -35 })
	end
	b:spike({ 0, 2.95, 0.25 }, 0.4, c.accent)
	b:ring({ 0, 1.0, 0.1 }, nil, 1.02, 22, { nil, 0.22, 0.12 }, GOLD, { mat = "metal" })
	b:box({ 0.4, 0.4, 0.08 }, { 0, 1.05, -0.93 }, GOLD_DARK, { 0, 0, 45 }, { mat = "metal" })
	for _, s in { -1, 1 } do
		b:ell({ 0.5, 0.3, 0.12 }, { 0.48 * s, 0.6, -0.86 }, c.glow or "FFE27A", { 0, 0, -12 * s }, { mat = "neon" })
		b:box({ 0.06, 0.24, 0.06 }, { 0.48 * s, 0.6, -0.93 }, BLACK)
	end
	-- huit tentacules hérissées
	local rs = { 0.6, 1.4, 2.2, 2.9, 3.4, 3.6 }
	local ys = { 0.35, -0.25, -0.65, -0.75, -0.45, 0.05 }
	local ds = { 0.78, 0.66, 0.56, 0.45, 0.34, 0.22 }
	for k = 0, 7 do
		local a = k / 8 * math.pi * 2 + math.pi / 8
		local pts = {}
		for i = 1, #rs do
			local wob = math.sin(i * 1.3 + k) * 0.25
			table.insert(pts, { math.cos(a + wob * 0.2) * rs[i], ys[i], 0.1 + math.sin(a + wob * 0.2) * rs[i] })
		end
		b:chain(pts, ds, c.body, "cyl", { name = "Body" })
		for i = 2, #rs - 1 do
			b:spike(add(pts[i], { 0, ds[i] * 0.45, 0 }), ds[i] * 0.6, c.accent, { 0, -math.deg(a), -20 })
		end
		for _, i in { 2, 4 } do
			local dir = sub(pts[i + 1], pts[i])
			b:add("cyl", { 0.12, ds[i] * 1.18, ds[i] * 1.18 }, add(pts[i], scale(dir, 0.5)), mul(alongY(dir), euler(0, 0, 90)), GOLD, { mat = "metal" })
		end
	end
	-- runes et bulles divines
	for k = 0, 5 do
		local a = k / 6 * math.pi * 2
		b:box({ 0.35, 0.5, 0.08 }, { math.cos(a) * 3.0, 2.2 + (k % 2) * 0.5, math.sin(a) * 3.0 }, GOLD, { 0, -math.deg(a) + 90, 0 }, { mat = "neon", tag = "SpinY" })
		b:ball(0.28, { math.cos(a + 0.5) * 2.4, 3.0 + (k % 3) * 0.3, math.sin(a + 0.5) * 2.4 }, "9FF2EA", { mat = "neon", alpha = 0.35, tag = "SpinY" })
	end
end

-- Léviathan cosmique, serpent enroulé (Cosmique)
species.leviathan = function(b, c)
	local pts, ds = {}, {}
	local n = 22
	for i = 0, n do
		local t = i / n
		local ang = t * math.pi * 3.2
		local r = 1.9 - t * 0.9
		table.insert(pts, { math.cos(ang) * r, -0.7 + t * 1.6, math.sin(ang) * r + 0.3 })
		table.insert(ds, 0.95 - t * 0.25)
	end
	-- le cou se dresse
	local last = pts[#pts]
	local neck = { add(last, { 0, 0.8, -0.2 }), add(last, { -0.1, 1.6, -0.6 }), { 0, 3.1, -0.7 } }
	for i, p in neck do
		table.insert(pts, p)
		table.insert(ds, 0.68 - i * 0.05)
	end
	b:chain(pts, ds, c.body, "cyl", { name = "Body" })
	for i = 2, #pts - 1 do
		local up = { 0, ds[i] * 0.48, 0 }
		b:spike(add(pts[i], up), ds[i] * 0.45, c.accent, { 15, 0, 0 })
		if i % 3 == 0 then
			local dir = sub(pts[i + 1], pts[i])
			b:add("cyl", { 0.16, ds[i] * 1.15, ds[i] * 1.15 }, add(pts[i], scale(dir, 0.5)), mul(alongY(dir), euler(0, 0, 90)), GOLD, { mat = "metal" })
		end
	end
	local head = { 0, 3.35, -1.05 }
	b:box({ 0.95, 0.75, 1.35 }, head, c.body, { 10, 0, 0 }, { name = "Body" })
	b:box({ 0.8, 0.25, 1.0 }, add(head, { 0, -0.5, -0.25 }), c.belly, { 25, 0, 0 })
	for k = -2, 2 do
		b:spike(add(head, { k * 0.15, -0.3, -0.75 }), 0.12, WHITE, { 180, 0, 0 })
	end
	fierceEyes(b, head[2] + 0.15, head[3] - 0.66, 0.3, c.glow or "FFE27A", 15)
	-- crête en éventail
	for k = -3, 3 do
		b:push(add(head, { 0, 0.35, 0.35 }), { -40 + math.abs(k) * 8, 0, k * 22 })
		b:box({ 0.1, 1.2, 0.3 }, { 0, 0.6, 0 }, c.dark)
		b:spike({ 0, 1.25, 0 }, 0.18, GOLD, nil, { mat = "metal" })
		b:pop()
	end
	for _, s in { -1, 1 } do
		b:chain({ add(head, { 0.35 * s, 0.3, 0.2 }), add(head, { 0.6 * s, 0.6, 0.8 }), add(head, { 0.55 * s, 1.0, 1.2 }) }, { 0.16, 0.12, 0.06 }, "E8E0C8", "cyl")
		b:push(add(head, { 0.5 * s, 0, 0.3 }), { 0, 0, -60 * s })
		b:box({ 0.08, 0.9, 0.6 }, { 0, 0.45, 0 }, c.dark, nil, { alpha = 0.1 })
		b:pop()
	end
	-- piliers dorés et bulles qui flottent autour
	for k = 0, 5 do
		local a = k / 6 * math.pi * 2
		local p = { math.cos(a) * 3.3, -0.2 + (k % 2) * 0.8, math.sin(a) * 3.3 + 0.3 }
		b:box({ 0.35, 1.0, 0.35 }, p, GOLD, nil, { mat = "metal", tag = "SpinY" })
		b:box({ 0.55, 0.18, 0.55 }, add(p, { 0, 0.55, 0 }), GOLD, nil, { mat = "metal", tag = "SpinY" })
		b:ball(0.3, add(p, { 0.6, 1.2, 0 }), "9FF2EA", { mat = "neon", alpha = 0.4, tag = "SpinY" })
	end
end

---------------------------------------------------------------------------
-- API
---------------------------------------------------------------------------
Shapes.species = species

-- Retourne la liste des pièces d'un pet.
-- colors : { body, belly, dark, accent, inner?, glow? } en hexadécimal.
function Shapes.build(speciesName, colors)
	local b = Shapes.builder()
	local f = species[speciesName] or species.bunny
	f(b, colors)
	return b.parts
end

return Shapes
