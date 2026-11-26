--!strict
-- Owned characters: grant, equip/unequip, equip best, sell, and the overhead
-- display (name tag + aura) of the player's best equipped character.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Characters = require(ReplicatedStorage.Shared.Characters)
local Config = require(ReplicatedStorage.Shared.Config)
local EconomyLogic = require(ReplicatedStorage.Shared.Util.EconomyLogic)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Maid = require(ReplicatedStorage.Shared.Util.Maid)
local Rarities = require(ReplicatedStorage.Shared.Rarities)
local Types = require(ReplicatedStorage.Shared.Types)
local Guard = require(script.Parent.Parent.Lib.Guard)
local ServerNet = require(script.Parent.Parent.Lib.ServerNet)
local PlayerData = require(script.Parent.PlayerData)
local StateSync = require(script.Parent.StateSync)
local Economy = require(script.Parent.Economy)

local MAX_STACK = 1e9
local DISPLAY_NAME = "RNGDisplay"
local AURA_NAME = "RNGAura"

local Inventory = {}

local playerMaids: { [Player]: Maid.Maid } = {}
-- Best character currently shown per player (avoids rebuilding replicated instances).
local shownDisplay: { [Player]: string } = {}

local function bestEquipped(profile: PlayerData.Profile): Types.CharacterDef?
	local best: Types.CharacterDef? = nil
	for _, id in profile.equipped do
		local def = Characters.get(id)
		if def and (best == nil or def.oneIn > best.oneIn) then
			best = def
		end
	end
	return best
end

-- Overhead name tag + aura. Pure presentation, rebuilt from server state only
-- when the displayed character actually changes (or `force` after a respawn).
local function refreshDisplay(player: Player, force: boolean?)
	local profile = PlayerData.get(player)
	local character = player.Character
	if not profile or not character then
		return
	end
	local best = bestEquipped(profile)
	local key = if best then best.id else ""
	if not force and shownDisplay[player] == key then
		return
	end
	shownDisplay[player] = key
	local head = character:FindFirstChild("Head")
	local root = character:FindFirstChild("HumanoidRootPart")
	if not head or not head:IsA("BasePart") or not root or not root:IsA("BasePart") then
		return
	end

	local old = head:FindFirstChild(DISPLAY_NAME)
	if old then
		old:Destroy()
	end
	local oldAura = root:FindFirstChild(AURA_NAME)
	if oldAura then
		oldAura:Destroy()
	end

	local def = best
	if not def then
		return
	end
	local rarity = Rarities[def.rarity]

	local gui = Instance.new("BillboardGui")
	gui.Name = DISPLAY_NAME
	gui.Size = UDim2.fromScale(8, 1.6)
	gui.StudsOffset = Vector3.new(0, 2.6, 0)
	gui.MaxDistance = 120
	gui.LightInfluence = 0

	local nameLabel = Instance.new("TextLabel")
	nameLabel.BackgroundTransparency = 1
	nameLabel.Size = UDim2.fromScale(1, 0.62)
	nameLabel.Font = Enum.Font.FredokaOne
	nameLabel.TextScaled = true
	nameLabel.Text = Characters.fullName(def)
	nameLabel.TextColor3 = if def.rarity == "Secret" then Color3.new(1, 1, 1) else rarity.color
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Color = if def.rarity == "Secret" then rarity.color else Color3.new(0, 0, 0)
	stroke.Parent = nameLabel
	nameLabel.Parent = gui

	local oddsLabel = Instance.new("TextLabel")
	oddsLabel.BackgroundTransparency = 1
	oddsLabel.Position = UDim2.fromScale(0, 0.62)
	oddsLabel.Size = UDim2.fromScale(1, 0.38)
	oddsLabel.Font = Enum.Font.GothamBold
	oddsLabel.TextScaled = true
	oddsLabel.TextColor3 = Color3.new(1, 1, 1)
	oddsLabel.Text = `{rarity.displayName} • {Format.odds(def.oneIn)}`
	local oddsStroke = Instance.new("UIStroke")
	oddsStroke.Thickness = 1.5
	oddsStroke.Parent = oddsLabel
	oddsLabel.Parent = gui

	gui.Parent = head

	if rarity.hasAura then
		-- Emitter on a plain attachment (never inside a Union, where it won't render).
		local attachment = Instance.new("Attachment")
		attachment.Name = AURA_NAME
		local emitter = Instance.new("ParticleEmitter")
		emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		emitter.Color = ColorSequence.new(rarity.color)
		emitter.LightEmission = 1
		emitter.Rate = 10 + rarity.order * 3 -- capped, scales with rarity
		emitter.Lifetime = NumberRange.new(0.8, 1.4)
		emitter.Speed = NumberRange.new(1, 3)
		emitter.SpreadAngle = Vector2.new(180, 180)
		emitter.Size = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.5),
			NumberSequenceKeypoint.new(1, 0),
		})
		emitter.Parent = attachment
		attachment.Parent = root
	end
end

-- Public API: used by Rolling and by cheat commands.
function Inventory.grant(player: Player, characterId: string, amount: number): boolean
	local profile = PlayerData.get(player)
	local def = Characters.get(characterId)
	if not profile or not def or amount < 1 then
		return false
	end
	profile.inventory[characterId] =
		math.min((profile.inventory[characterId] or 0) + amount, MAX_STACK)
	profile.discovered[characterId] = true
	if def.oneIn > profile.bestOneIn then
		profile.bestOneIn = def.oneIn
	end
	-- Free slot? Equip automatically so new players earn right away.
	if
		#profile.equipped < Config.MAX_EQUIPPED and not table.find(profile.equipped, characterId)
	then
		table.insert(profile.equipped, characterId)
		refreshDisplay(player)
	end
	StateSync.markDirty(player)
	return true
end

function Inventory.equipBest(player: Player)
	local profile = PlayerData.get(player)
	if not profile then
		return
	end
	local owned: { Types.CharacterDef } = {}
	for id in profile.inventory do
		local def = Characters.get(id)
		if def then
			table.insert(owned, def)
		end
	end
	table.sort(owned, function(a, b)
		return a.power > b.power
	end)
	table.clear(profile.equipped)
	for i = 1, math.min(Config.MAX_EQUIPPED, #owned) do
		table.insert(profile.equipped, owned[i].id)
	end
	refreshDisplay(player)
	StateSync.markDirty(player)
end

local function onToggleEquip(player: Player, rawId: unknown)
	local characterId = Guard.id(rawId)
	if not characterId or not Characters.get(characterId) then
		return
	end
	local profile = PlayerData.get(player)
	if not profile or (profile.inventory[characterId] or 0) < 1 then
		return
	end
	local index = table.find(profile.equipped, characterId)
	if index then
		table.remove(profile.equipped, index)
	elseif #profile.equipped < Config.MAX_EQUIPPED then
		table.insert(profile.equipped, characterId)
	else
		ServerNet.fire("Notify", player, `Maximum {Config.MAX_EQUIPPED} persos équipés.`)
		return
	end
	refreshDisplay(player)
	StateSync.markDirty(player)
end

local function onSell(player: Player, rawId: unknown, rawAmount: unknown)
	-- type + range
	local characterId = Guard.id(rawId)
	local amount = Guard.integer(rawAmount, 1, MAX_STACK)
	if not characterId or not amount then
		return
	end
	local def = Characters.get(characterId)
	local profile = PlayerData.get(player)
	if not def or not profile then
		return
	end
	-- plausibility: owns enough, and keeps one copy of anything equipped
	local owned = profile.inventory[characterId] or 0
	local keep = if table.find(profile.equipped, characterId) then 1 else 0
	local sellable = math.min(amount, owned - keep)
	if sellable < 1 then
		ServerNet.fire("Notify", player, "Retire ce perso de ton équipe pour vendre le dernier.")
		return
	end

	local remaining = owned - sellable
	profile.inventory[characterId] = if remaining > 0 then remaining else nil
	Economy.addCoins(player, EconomyLogic.sellValue(def) * sellable)
	StateSync.markDirty(player)
end

local function onPlayerLoaded(player: Player)
	local maid = Maid.new()
	playerMaids[player] = maid
	maid:add(player.CharacterAdded:Connect(function(character: Model)
		character:WaitForChild("Head", 10)
		character:WaitForChild("HumanoidRootPart", 10)
		refreshDisplay(player, true)
	end))
	if player.Character then
		refreshDisplay(player, true)
	end
end

function Inventory.refreshDisplay(player: Player)
	refreshDisplay(player, true)
end

function Inventory.init()
	ServerNet.onEvent("ToggleEquip", { rate = 8, burst = 10 }, onToggleEquip)
	ServerNet.onEvent("EquipBest", { rate = 1, burst = 3 }, function(player: Player)
		Inventory.equipBest(player)
	end)
	ServerNet.onEvent("Sell", { rate = 8, burst = 10 }, onSell)

	PlayerData.Loaded:Connect(onPlayerLoaded)
	Players.PlayerRemoving:Connect(function(player: Player)
		shownDisplay[player] = nil
		local maid = playerMaids[player]
		if maid then
			maid:clean()
			playerMaids[player] = nil
		end
	end)
end

return Inventory
