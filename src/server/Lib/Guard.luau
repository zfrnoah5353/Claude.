--!strict
-- Runtime validators for remote arguments (type -> range). Every argument
-- that arrives from a client is `unknown` until it passes one of these.

local Guard = {}

function Guard.isFiniteNumber(value: unknown): boolean
	return typeof(value) == "number"
		and value == value
		and value ~= math.huge
		and value ~= -math.huge
end

-- Integer in [min, max], rejecting NaN / inf / fractions.
function Guard.integer(value: unknown, min: number, max: number): number?
	if not Guard.isFiniteNumber(value) then
		return nil
	end
	local n = value :: number
	if n ~= math.floor(n) or n < min or n > max then
		return nil
	end
	return n
end

-- Short identifier string (catalog ids, upgrade ids, commands).
function Guard.id(value: unknown, maxLength: number?): string?
	if typeof(value) ~= "string" then
		return nil
	end
	local s = value :: string
	if #s == 0 or #s > (maxLength or 32) then
		return nil
	end
	if not s:match("^[%w_]+$") then
		return nil
	end
	return s
end

return table.freeze(Guard)
