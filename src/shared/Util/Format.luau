--!strict
-- Number formatting for UI (pure).

local Format = {}

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi" }

-- 1234 -> "1.23K", 999 -> "999"
function Format.short(n: number): string
	if n ~= n then
		return "0"
	end
	local negative = n < 0
	local value = math.abs(n)
	local index = 1
	while value >= 1000 and index < #SUFFIXES do
		value /= 1000
		index += 1
	end
	local text: string
	if index == 1 then
		text = tostring(math.floor(value))
	elseif value >= 100 then
		text = string.format("%d%s", math.floor(value), SUFFIXES[index])
	elseif value >= 10 then
		text = string.format("%.1f%s", math.floor(value * 10) / 10, SUFFIXES[index])
	else
		text = string.format("%.2f%s", math.floor(value * 100) / 100, SUFFIXES[index])
	end
	return if negative then "-" .. text else text
end

-- 1000000 -> "1 000 000" (French thousands separator)
function Format.thousands(n: number): string
	local digits = tostring(math.floor(math.abs(n)))
	local out = digits:reverse():gsub("(%d%d%d)", "%1 "):reverse()
	if out:sub(1, 1) == " " then
		out = out:sub(2)
	end
	return if n < 0 then "-" .. out else out
end

function Format.odds(oneIn: number): string
	return "1 sur " .. Format.thousands(oneIn)
end

return table.freeze(Format)
