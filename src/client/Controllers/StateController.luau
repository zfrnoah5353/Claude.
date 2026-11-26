--!strict
-- Holds the latest server snapshot. Renders nothing; other controllers
-- subscribe to Changed / CoinsChanged. The client never computes state.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = require(ReplicatedStorage.Shared.Net)
local Signal = require(ReplicatedStorage.Shared.Util.Signal)
local Types = require(ReplicatedStorage.Shared.Types)

local StateController = {}

StateController.Changed = Signal.new() :: Signal.Signal<Types.StateSnapshot>
StateController.CoinsChanged = Signal.new() :: Signal.Signal<number>

local state: Types.StateSnapshot? = nil

function StateController.get(): Types.StateSnapshot?
	return state
end

function StateController.init()
	Net.event("StateSnapshot").OnClientEvent:Connect(function(snapshot: Types.StateSnapshot)
		state = snapshot
		StateController.Changed:Fire(snapshot)
		StateController.CoinsChanged:Fire(snapshot.coins)
	end)
	Net.event("CoinsChanged").OnClientEvent:Connect(function(coins: number)
		local current = state
		if current then
			current.coins = coins
		end
		StateController.CoinsChanged:Fire(coins)
	end)
end

return StateController
