--!strict
-- Coins: passive income from equipped characters, and upgrade purchases.
-- Prices and effects come from the server's copy of Config, never the client.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local EconomyLogic = require(ReplicatedStorage.Shared.Util.EconomyLogic)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Types = require(ReplicatedStorage.Shared.Types)
local Guard = require(script.Parent.Parent.Lib.Guard)
local ServerNet = require(script.Parent.Parent.Lib.ServerNet)
local PlayerData = require(script.Parent.PlayerData)
local StateSync = require(script.Parent.StateSync)

local MAX_COINS = 1e15 -- keeps values JSON-safe and integer-exact

local Economy = {}

-- Public API used by gameplay AND by cheat commands (same code path).
function Economy.addCoins(player: Player, amount: number): boolean
	local profile = PlayerData.get(player)
	if not profile or amount ~= amount then
		return false
	end
	profile.coins = math.clamp(math.floor(profile.coins + amount), 0, MAX_COINS)
	StateSync.sendCoins(player, profile.coins)
	return true
end

local function onBuyUpgrade(player: Player, rawUpgradeId: unknown)
	-- 1. type
	local upgradeId = Guard.id(rawUpgradeId, 16)
	if not upgradeId then
		return
	end
	-- 2. range / existence (server catalog)
	local def = Config.UPGRADES[upgradeId :: Types.UpgradeId]
	if not def then
		return
	end
	-- 3. permission
	local profile = PlayerData.get(player)
	if not profile then
		return
	end
	local id = def.id
	local level = profile.upgrades[id]
	if level >= def.maxLevel then
		return
	end
	-- 4. plausibility: server-side price vs server-side balance
	local cost = EconomyLogic.upgradeCost(id, level)
	if profile.coins < cost then
		ServerNet.fire(
			"Notify",
			player,
			`Il te manque {Format.short(cost - profile.coins)} pièces.`
		)
		return
	end

	profile.coins -= cost
	profile.upgrades[id] = level + 1
	StateSync.markDirty(player)
end

function Economy.init()
	ServerNet.onEvent("BuyUpgrade", { rate = 4, burst = 6 }, onBuyUpgrade)
end

function Economy.start()
	local accumulator = 0
	RunService.Heartbeat:Connect(function(dt: number)
		accumulator += dt
		if accumulator < Config.INCOME_TICK_SECONDS then
			return
		end
		accumulator -= Config.INCOME_TICK_SECONDS
		for _, player in Players:GetPlayers() do
			local profile = PlayerData.get(player)
			if profile and #profile.equipped > 0 then
				Economy.addCoins(
					player,
					StateSync.incomePerSecond(profile) * Config.INCOME_TICK_SECONDS
				)
			end
		end
	end)
end

return Economy
