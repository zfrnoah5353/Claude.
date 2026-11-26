--!strict
-- AnimeRNG server entry point (the only Script on the server).
-- Two-phase bootstrap: init() every system, then start() every system.

local Systems = script.Systems

-- Explicit list (static requires keep --!strict happy and make the order obvious).
local loaded: { any } = {
	require(Systems.PlayerData),
	require(Systems.StateSync),
	require(Systems.Economy),
	require(Systems.Inventory),
	require(Systems.Rolling),
	require(Systems.CheatCommands),
}

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
