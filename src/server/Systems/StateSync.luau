--!strict
-- Replicates profile state to each client. Systems call markDirty(player)
-- after a mutation; dirty players get ONE full snapshot per flush (10 Hz max),
-- never one remote per change. Coins get a cheaper dedicated event.
--
-- Late-join safe: a snapshot is sent once BOTH the profile is loaded and the
-- client has said it is listening (ClientReady), whichever happens last.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Characters = require(ReplicatedStorage.Shared.Characters)
local EconomyLogic = require(ReplicatedStorage.Shared.Util.EconomyLogic)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Signal = require(ReplicatedStorage.Shared.Util.Signal)
local Types = require(ReplicatedStorage.Shared.Types)
local ServerNet = require(script.Parent.Parent.Lib.ServerNet)
local SessionState = require(script.Parent.Parent.Lib.SessionState)
local PlayerData = require(script.Parent.PlayerData)

local FLUSH_INTERVAL = 0.1

local StateSync = {}

-- Fired once per session when the player is loaded AND the client is listening.
StateSync.Ready = Signal.new() :: Signal.Signal<Player>

local clientReady: { [Player]: boolean } = {}
local announcedReady: { [Player]: boolean } = {}
local dirty: { [Player]: boolean } = {}

type Leaderstats = { rolls: IntValue, best: StringValue }
local leaderstats: { [Player]: Leaderstats } = {}

local function equippedDefs(profile: PlayerData.Profile): { Types.CharacterDef }
	local defs = {}
	for _, id in profile.equipped do
		local def = Characters.get(id)
		if def then
			table.insert(defs, def)
		end
	end
	return defs
end

function StateSync.incomePerSecond(profile: PlayerData.Profile): number
	return EconomyLogic.incomePerSecond(equippedDefs(profile), profile.upgrades.income)
end

function StateSync.buildSnapshot(player: Player, profile: PlayerData.Profile): Types.StateSnapshot
	local session = SessionState.get(player)
	return {
		coins = profile.coins,
		totalRolls = profile.totalRolls,
		pity = profile.pity,
		bestOneIn = profile.bestOneIn,
		inventory = profile.inventory,
		equipped = profile.equipped,
		discovered = profile.discovered,
		upgrades = profile.upgrades,
		luck = EconomyLogic.luckMultiplier(profile.upgrades.luck) * (session.luckOverride or 1),
		rollCooldown = EconomyLogic.rollCooldown(profile.upgrades.speed),
		incomePerSecond = StateSync.incomePerSecond(profile),
	}
end

function StateSync.markDirty(player: Player)
	dirty[player] = true
end

function StateSync.isReady(player: Player): boolean
	return announcedReady[player] == true
end

function StateSync.sendCoins(player: Player, coins: number)
	if announcedReady[player] then
		ServerNet.fire("CoinsChanged", player, coins)
	end
end

local function createLeaderstats(player: Player)
	local folder = Instance.new("Folder")
	folder.Name = "leaderstats"
	local rolls = Instance.new("IntValue")
	rolls.Name = "Rolls"
	rolls.Parent = folder
	local best = Instance.new("StringValue")
	best.Name = "Meilleur"
	best.Value = "-"
	best.Parent = folder
	folder.Parent = player
	leaderstats[player] = { rolls = rolls, best = best }
end

local function updateLeaderstats(player: Player, profile: PlayerData.Profile)
	local stats = leaderstats[player]
	if not stats then
		return
	end
	stats.rolls.Value = profile.totalRolls
	stats.best.Value = if profile.bestOneIn > 0
		then "1/" .. Format.short(profile.bestOneIn)
		else "-"
end

local function tryAnnounceReady(player: Player)
	if announcedReady[player] or not clientReady[player] or not PlayerData.get(player) then
		return
	end
	announcedReady[player] = true
	dirty[player] = true
	StateSync.Ready:Fire(player)
end

function StateSync.init()
	ServerNet.onEvent("ClientReady", { rate = 1, burst = 2 }, function(player: Player)
		clientReady[player] = true
		tryAnnounceReady(player)
	end)

	PlayerData.Loaded:Connect(function(player: Player, profile: PlayerData.Profile)
		createLeaderstats(player)
		updateLeaderstats(player, profile)
		tryAnnounceReady(player)
	end)

	Players.PlayerRemoving:Connect(function(player: Player)
		clientReady[player] = nil
		announcedReady[player] = nil
		dirty[player] = nil
		leaderstats[player] = nil
	end)
end

function StateSync.start()
	local accumulator = 0
	RunService.Heartbeat:Connect(function(dt: number)
		accumulator += dt
		if accumulator < FLUSH_INTERVAL then
			return
		end
		accumulator = 0
		for player in dirty do
			dirty[player] = nil
			local profile = PlayerData.get(player)
			if profile then
				updateLeaderstats(player, profile)
				if announcedReady[player] then
					ServerNet.fire(
						"StateSnapshot",
						player,
						StateSync.buildSnapshot(player, profile)
					)
				end
			end
		end
	end)
end

return StateSync
