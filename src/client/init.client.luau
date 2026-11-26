--!strict
-- AnimeRNG client entry point (the only LocalScript).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- ReplicatedStorage must be fully replicated before controllers index it.
if not game:IsLoaded() then
	game.Loaded:Wait()
end

local Controllers = script:WaitForChild("Controllers")

local loaded: { [string]: any } = {}
for _, child in Controllers:GetChildren() do
	if child:IsA("ModuleScript") then
		loaded[child.Name] = require(child) :: any
	end
end

for _, controller in loaded do
	if typeof(controller.init) == "function" then
		controller.init()
	end
end

for _, controller in loaded do
	if typeof(controller.start) == "function" then
		task.spawn(controller.start)
	end
end

-- Every controller is listening: ask the server for the full snapshot.
local Net = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Net"))
Net.event("ClientReady"):FireServer()

print("[AnimeRNG] client started")
