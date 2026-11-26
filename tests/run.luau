--!nocheck
-- Headless runner for the pure-logic specs (Lune). Provides a minimal
-- TestEZ-compatible API (describe / it / expect) and a `script.Parent`
-- shim so the same .spec.luau files run in Studio with TestEZ and here.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")

-- Seeded Random shim (Park-Miller), enough for statistical specs.
local Random = {}
function Random.new(seed)
	local state = math.max(1, math.floor(seed or os.clock() * 1e6) % 2147483647)
	return {
		NextNumber = function()
			state = (state * 48271) % 2147483647
			return state / 2147483647
		end,
	}
end

-- Color3 shim: catalog modules build colors at load time.
local Color3 = {
	fromRGB = function(r, g, b)
		return { R = r / 255, G = g / 255, B = b / 255 }
	end,
	new = function(r, g, b)
		return { R = r, G = g, B = b }
	end,
}

local SPECS = {
	"src/shared/Util/RollLogic.spec.luau",
	"src/shared/Util/EconomyLogic.spec.luau",
	"src/shared/Util/Format.spec.luau",
	"src/server/Lib/ProfileSchema.spec.luau",
}

local moduleCache = {}
local loadFile

-- Fake Instance path: indexing walks the filesystem.
local function pathNode(path)
	return setmetatable({ __path = path }, {
		__index = function(self, key)
			if key == "Parent" then
				return pathNode(self.__path:match("^(.*)/[^/]+$") or ".")
			end
			return pathNode(self.__path .. "/" .. key)
		end,
	})
end

local function resolve(node)
	local base = node.__path
	for _, candidate in { base .. ".luau", base .. "/init.luau" } do
		if fs.isFile(candidate) then
			return candidate
		end
	end
	error("cannot resolve module " .. base)
end

local function makeEnv(file)
	local env = setmetatable({}, { __index = _G })
	env.script = pathNode(file:gsub("%.luau$", ""))
	env.require = function(node)
		local path = resolve(node)
		if moduleCache[path] == nil then
			moduleCache[path] = loadFile(path)() or false
		end
		return moduleCache[path] or nil
	end
	env.Random = Random
	env.Color3 = Color3
	env.task = require("@lune/task")
	env.table = table
	return env
end

loadFile = function(path)
	local source = fs.readFile(path)
	local bytecode = luau.compile(source)
	return luau.load(bytecode, { debugName = path, environment = makeEnv(path) })
end

-- Minimal TestEZ surface
local passed, failed = 0, 0
local stack = {}

local function expect(actual)
	local api = {}
	api.to = api
	api.be = api
	function api.equal(expected)
		if actual ~= expected then
			error(("expected %s, got %s"):format(tostring(expected), tostring(actual)), 2)
		end
	end
	function api.throw()
		if pcall(actual) then
			error("expected function to throw", 2)
		end
	end
	return api
end

local function describe(name, fn)
	table.insert(stack, name)
	fn()
	table.remove(stack)
end

local function it(name, fn)
	local label = table.concat(stack, " > ") .. " > " .. name
	local ok, err = pcall(fn)
	if ok then
		passed += 1
		print("  ok   " .. label)
	else
		failed += 1
		print("  FAIL " .. label .. "\n       " .. tostring(err))
	end
end

for _, spec in SPECS do
	print(spec)
	local env = makeEnv(spec)
	env.describe = describe
	env.it = it
	env.expect = expect
	local chunk =
		luau.load(luau.compile(fs.readFile(spec)), { debugName = spec, environment = env })
	chunk()()
end

print(("\n%d passed, %d failed"):format(passed, failed))
process.exit(if failed > 0 then 1 else 0)
