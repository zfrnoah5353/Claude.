--!strict
-- AnimeRNG server entry point (the only Script on the server).
-- Two-phase bootstrap: init() every system, then start() every system.

local Systems = script:WaitForChild("Systems")

local loaded: { [string]: any } = {}
for _, child in Systems:GetChildren() do
	if child:IsA("ModuleScript") then
		loaded[child.Name] = require(child) :: any
	end
end

for _, system in loaded do
	if typeof(system.init) == "function" then
		system.init()
	end
end

for _, system in loaded do
	if typeof(system.start) == "function" then
		task.spawn(system.start)
	end
end

print("[AnimeRNG] server started")
