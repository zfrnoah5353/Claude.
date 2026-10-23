-- Encodeur JSON minimal pour les outils hors Roblox
local function enc(v, out)
	local t = type(v)
	if t == "table" then
		if #v > 0 or next(v) == nil then
			table.insert(out, "[")
			for i, x in v do
				if i > 1 then table.insert(out, ",") end
				enc(x, out)
			end
			table.insert(out, "]")
		else
			table.insert(out, "{")
			local first = true
			for k, x in v do
				if not first then table.insert(out, ",") end
				first = false
				table.insert(out, string.format("%q:", tostring(k)))
				enc(x, out)
			end
			table.insert(out, "}")
		end
	elseif t == "number" then
		table.insert(out, string.format("%.5g", v))
	elseif t == "string" then
		table.insert(out, string.format("%q", v))
	elseif t == "boolean" then
		table.insert(out, tostring(v))
	else
		table.insert(out, "null")
	end
end
return function(v)
	local out = {}
	enc(v, out)
	return table.concat(out)
end
