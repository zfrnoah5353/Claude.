-- doublures minimales des types Roblox utilisés par Config
local C3 = {}
C3.__index = C3
local function c3(r, g, b)
	return setmetatable({ R = r, G = g, B = b }, C3)
end
function C3:ToHex()
	return string.format("%02X%02X%02X", math.floor(self.R * 255 + 0.5), math.floor(self.G * 255 + 0.5), math.floor(self.B * 255 + 0.5))
end
function C3:Lerp(o, t)
	return c3(self.R + (o.R - self.R) * t, self.G + (o.G - self.G) * t, self.B + (o.B - self.B) * t)
end
local Color3 = {
	fromHex = function(h)
		h = string.gsub(h, "#", "")
		return c3(tonumber(string.sub(h, 1, 2), 16) / 255, tonumber(string.sub(h, 3, 4), 16) / 255, tonumber(string.sub(h, 5, 6), 16) / 255)
	end,
	new = c3,
}
local Vector3 = { new = function(x, y, z) return { X = x, Y = y, Z = z } end, zero = { X = 0, Y = 0, Z = 0 } }

return { Color3 = Color3, Vector3 = Vector3, c3 = c3 }
