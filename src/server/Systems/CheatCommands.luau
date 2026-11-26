--!strict
-- QA tooling. Active automatically in Studio, and in live servers ONLY for the
-- UserIds listed below. The gate is checked server-side in the handler: the
-- remote name is public, hiding the client panel protects nothing.
-- Every command goes through the real system APIs, never raw data.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Characters = require(ReplicatedStorage.Shared.Characters)
local Config = require(ReplicatedStorage.Shared.Config)
local Guard = require(script.Parent.Parent.Lib.Guard)
local ServerNet = require(script.Parent.Parent.Lib.ServerNet)
local PlayerData = require(script.Parent.PlayerData)
local StateSync = require(script.Parent.StateSync)
local Economy = require(script.Parent.Economy)
local Inventory = require(script.Parent.Inventory)
local Rolling = require(script.Parent.Rolling)

-- Add your Roblox UserId here to use the QA panel in live servers.
local DEV_USER_IDS: { [number]: boolean } = {
	-- [12345678] = true,
}

local CheatCommands = {}

function CheatCommands.isAuthorized(player: Player): boolean
	if RunService:IsStudio() then
		return true
	end
	return DEV_USER_IDS[player.UserId] == true
end

local function onCheat(player: Player, rawCommand: unknown, rawValue: unknown)
	if not CheatCommands.isAuthorized(player) then
		return
	end
	local command = Guard.id(rawCommand, 16)
	if not command then
		return
	end

	if command == "coins" then
		local amount = Guard.integer(rawValue, 1, 1e12)
		if amount then
			Economy.addCoins(player, amount)
		end
	elseif command == "luck" then
		local multiplier = Guard.integer(rawValue, 1, 1e6)
		if multiplier then
			Rolling.setLuckOverride(player, if multiplier == 1 then nil else multiplier)
		end
	elseif command == "pity" then
		Rolling.setPity(player, Config.PITY_THRESHOLD - 1)
	elseif command == "grantAll" then
		for _, def in Characters.list do
			Inventory.grant(player, def.id, 1)
		end
	elseif command == "reset" then
		Rolling.setLuckOverride(player, nil)
		if PlayerData.reset(player) then
			Inventory.refreshDisplay(player)
			StateSync.markDirty(player)
		end
	end
end

function CheatCommands.init()
	ServerNet.onEvent("Cheat", { rate = 3, burst = 5 }, onCheat)

	StateSync.Ready:Connect(function(player: Player)
		ServerNet.fire("CheatAccess", player, CheatCommands.isAuthorized(player))
		if PlayerData.isMemoryOnly() then
			ServerNet.fire(
				"Notify",
				player,
				"Mode Studio : la sauvegarde est désactivée (API Services)."
			)
		end
	end)
end

return CheatCommands
