--!strict
-- Server side of the remote boundary. Creates every remote from the shared
-- list, and wraps handlers so each one is rate-limited before it runs.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local RateLimit = require(script.Parent.RateLimit)

local ServerNet = {}

local folder = Instance.new("Folder")
folder.Name = Remotes.FOLDER_NAME

local events: { [string]: RemoteEvent } = {}
local functions: { [string]: RemoteFunction } = {}

for _, name in Remotes.EVENTS do
	local remote = Instance.new("RemoteEvent")
	remote.Name = name
	remote.Parent = folder
	events[name] = remote
end
for _, name in Remotes.FUNCTIONS do
	local remote = Instance.new("RemoteFunction")
	remote.Name = name
	remote.Parent = folder
	functions[name] = remote
end

-- Parented once everything exists, so clients never see a half-built folder.
folder.Parent = ReplicatedStorage

export type Limit = { rate: number, burst: number }

function ServerNet.onEvent(
	name: Remotes.EventName,
	limit: Limit,
	handler: (player: Player, ...unknown) -> ()
)
	events[name].OnServerEvent:Connect(function(player: Player, ...: unknown)
		if not RateLimit.allow(player, name, limit.rate, limit.burst) then
			return
		end
		handler(player, ...)
	end)
end

function ServerNet.onInvoke(
	name: Remotes.FunctionName,
	limit: Limit,
	handler: (player: Player, ...unknown) -> any
)
	functions[name].OnServerInvoke = function(player: Player, ...: unknown): any
		if not RateLimit.allow(player, name, limit.rate, limit.burst) then
			return nil
		end
		return handler(player, ...)
	end
end

function ServerNet.fire(name: Remotes.EventName, player: Player, ...: any)
	events[name]:FireClient(player, ...)
end

function ServerNet.fireAll(name: Remotes.EventName, ...: any)
	events[name]:FireAllClients(...)
end

return table.freeze(ServerNet)
