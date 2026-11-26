--!strict
-- The roll button, auto-roll and the reveal animation.
-- The client asks the server to roll and animates the server's answer;
-- the spinning names are pure decoration (anticipation before payoff).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Characters = require(ReplicatedStorage.Shared.Characters)
local Config = require(ReplicatedStorage.Shared.Config)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Net = require(ReplicatedStorage.Shared.Net)
local Rarities = require(ReplicatedStorage.Shared.Rarities)
local Types = require(ReplicatedStorage.Shared.Types)
local Ui = require(script.Parent.Parent.Lib.Ui)
local StateController = require(script.Parent.StateController)

local SPIN_SECONDS = 0.85
local SPIN_SECONDS_AUTO = 0.35
local SPIN_TICK = 0.07
local SERVER_TIMEOUT = 6
local REVEAL_HOLD = 2.2
local CLIENT_COOLDOWN_MARGIN = 0.05
local BIG_MOMENT_ORDER = 5 -- Legendary and above get the full show

local RollController = {}

local rollGroup: CanvasGroup
local rollButton: TextButton
local autoButton: TextButton
local infoLabel: TextLabel
local boostLabel: TextLabel

local reveal: Frame
local revealStroke: UIStroke
local rarityLabel: TextLabel
local nameLabel: TextLabel
local oddsLabel: TextLabel
local newBadge: TextLabel
local bonusLabel: TextLabel
local flash: Frame

local rolling = false
local autoOn = false
local lastRollAt = -math.huge
local revealToken = 0

local function rollCooldown(): number
	local state = StateController.get()
	return (if state then state.rollCooldown else Config.BASE_ROLL_COOLDOWN)
		+ CLIENT_COOLDOWN_MARGIN
end

-- Decorative pick for the spinning names (biased toward commons, with teases).
local function decoyCharacter(): Types.CharacterDef
	local list = Characters.list
	if math.random() < 0.12 then
		return list[math.random(1, #list)]
	end
	return list[math.random(1, math.min(9, #list))]
end

local function showCharacter(def: Types.CharacterDef)
	local rarity = Rarities[def.rarity]
	local isSecret = def.rarity == "Secret"
	rarityLabel.Text = rarity.displayName
	rarityLabel.TextColor3 = if isSecret then Ui.Theme.text else rarity.color
	nameLabel.Text = Characters.fullName(def)
	nameLabel.TextColor3 = if isSecret then Ui.Theme.text else rarity.color
	oddsLabel.Text = Format.odds(def.oneIn)
	revealStroke.Color = if isSecret then Ui.Theme.accent2 else rarity.color
end

local function hideReveal()
	local scale = Ui.scaleOf(reveal)
	local out = Ui.tween(scale, Ui.FAST, { Scale = 0 })
	out.Completed:Once(function(state)
		if state == Enum.PlaybackState.Completed then
			reveal.Visible = false
		end
	end)
end

local function setRollEnabled(enabled: boolean)
	rollButton.Active = enabled
	Ui.tween(rollGroup, Ui.FAST, { GroupTransparency = if enabled then 0 else 0.35 })
end

local function playReveal(result: Types.RollResult, def: Types.CharacterDef)
	local rarity = Rarities[def.rarity]
	local bigMoment = rarity.order >= BIG_MOMENT_ORDER

	if bigMoment and not autoOn then
		-- Anticipation: glow build-up in the rarity color before the payoff.
		revealStroke.Color = rarity.color
		Ui.tween(revealStroke, TweenInfo.new(0.5), { Thickness = 8 })
		Ui.shake(reveal, 4, 0.5)
		task.wait(0.5)
	end

	showCharacter(def)
	newBadge.Visible = result.isNew
	bonusLabel.Visible = result.boosted or result.pityTriggered
	bonusLabel.Text = if result.pityTriggered
		then "GARANTI !"
		else `CHANCE x{Config.BOOSTED_ROLL_MULTIPLIER}`

	local scale = Ui.scaleOf(reveal)
	scale.Scale = 0.7
	Ui.tween(scale, Ui.BOUNCY, { Scale = 1 })
	revealStroke.Thickness = if bigMoment then 6 else 3

	flash.BackgroundTransparency = if bigMoment then 0 else 0.5
	Ui.tween(flash, TweenInfo.new(if bigMoment then 0.6 else 0.25), { BackgroundTransparency = 1 })

	if bigMoment then
		Ui.sound(Ui.SOUND_RARE, 0.6)
		Ui.shake(reveal, 3, 0.2)
	else
		Ui.sound(Ui.SOUND_REVEAL, 0.35, 0.9 + rarity.order * 0.05)
	end
	if result.isNew then
		Ui.pop(newBadge, 1.25)
	end

	revealToken += 1
	local token = revealToken
	task.delay(if bigMoment then REVEAL_HOLD * 1.6 else REVEAL_HOLD, function()
		if token == revealToken and not rolling then
			hideReveal()
		end
	end)
end

local rollRemote: RemoteFunction

local function doRoll()
	if rolling or os.clock() - lastRollAt < rollCooldown() then
		return
	end
	rolling = true
	lastRollAt = os.clock()
	revealToken += 1
	setRollEnabled(false)

	local result: Types.RollResult? = nil
	local answered = false
	task.spawn(function()
		local ok, response = pcall(function()
			return rollRemote:InvokeServer()
		end)
		if ok and typeof(response) == "table" then
			result = response :: Types.RollResult
		end
		answered = true
	end)

	-- Spin until the minimum time has passed AND the server has answered.
	reveal.Visible = true
	newBadge.Visible = false
	bonusLabel.Visible = false
	revealStroke.Thickness = 3
	local scale = Ui.scaleOf(reveal)
	if scale.Scale < 0.9 then
		scale.Scale = 0.85
		Ui.tween(scale, Ui.FAST, { Scale = 1 })
	end
	local minimum = if autoOn then SPIN_SECONDS_AUTO else SPIN_SECONDS
	local started = os.clock()
	local nextTick = 0
	while true do
		local elapsed = os.clock() - started
		if (elapsed >= minimum and answered) or elapsed >= SERVER_TIMEOUT then
			break
		end
		if elapsed >= nextTick then
			nextTick = elapsed + SPIN_TICK
			showCharacter(decoyCharacter())
			if not autoOn then
				Ui.sound(Ui.SOUND_TICK, 0.15, 1.4)
			end
		end
		RunService.Heartbeat:Wait()
	end

	local final = result
	local def = if final then Characters.get(final.id) else nil
	if final and def then
		playReveal(final, def)
	else
		hideReveal() -- rejected (cooldown) or timed out: nothing to show
	end

	rolling = false
	setRollEnabled(true)
end

local function autoLoop()
	while autoOn do
		local remaining = lastRollAt + rollCooldown() - os.clock()
		if remaining > 0 then
			task.wait(remaining)
		end
		if autoOn and not rolling then
			doRoll()
		end
		RunService.Heartbeat:Wait()
	end
end

local function setAuto(on: boolean)
	autoOn = on
	autoButton.Text = if on then "AUTO\nON" else "AUTO\nOFF"
	Ui.setEnabled(autoButton, true, if on then Ui.Theme.good else Ui.Theme.card)
	if on then
		task.spawn(autoLoop)
	end
end

local function renderInfo(state: Types.StateSnapshot)
	local untilBoost = Config.BOOSTED_ROLL_EVERY - (state.totalRolls % Config.BOOSTED_ROLL_EVERY)
	boostLabel.Text = if untilBoost == 1
		then `x{Config.BOOSTED_ROLL_MULTIPLIER} AU\nPROCHAIN !`
		else `x{Config.BOOSTED_ROLL_MULTIPLIER} dans\n{untilBoost}`
	boostLabel.TextColor3 = if untilBoost == 1 then Ui.Theme.gold else Ui.Theme.muted
	local untilPity = math.max(1, Config.PITY_THRESHOLD - state.pity)
	infoLabel.Text = string.format(
		"Chance x%.2f  •  Légendaire garanti dans %d rolls  •  %s rolls",
		state.luck,
		untilPity,
		Format.thousands(state.totalRolls)
	)
end

local function build()
	local root = Ui.root()

	local bar: Frame = Ui.make("Frame", {
		Name = "RollBar",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.fromScale(0.5, 0.98),
		Size = UDim2.fromScale(0.46, 0.17),
		Parent = root,
	})
	Ui.aspect(bar, 3.6)

	-- Roll button: CanvasGroup + UICorner so the sheen sweep clips to the rounded shape.
	rollGroup = Ui.make("CanvasGroup", {
		Name = "RollGroup",
		BackgroundColor3 = Ui.Theme.accent,
		Position = UDim2.fromScale(0.2, 0),
		Size = UDim2.fromScale(0.6, 0.68),
		Parent = bar,
	})
	Ui.corner(rollGroup, 0.25)
	Ui.make("UIGradient", {
		Color = ColorSequence.new(Ui.Theme.accent, Ui.Theme.accent2),
		Rotation = 90,
		Parent = rollGroup,
	})
	rollButton = Ui.button({
		Name = "Roll",
		Text = "ROLL",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		MaxTextSize = 56,
		ZIndex = 3,
		Parent = rollGroup,
	}, Ui.Theme.accent)
	rollButton.BackgroundTransparency = 1
	local sheen: Frame = Ui.make("Frame", {
		Name = "Sheen",
		BackgroundColor3 = Color3.new(1, 1, 1),
		BackgroundTransparency = 0.7,
		Rotation = 20,
		Position = UDim2.fromScale(-0.3, -0.5),
		Size = UDim2.fromScale(0.12, 2),
		ZIndex = 2,
		Parent = rollGroup,
	})
	local barStroke: Frame = Ui.make("Frame", {
		BackgroundTransparency = 1,
		Position = rollGroup.Position,
		Size = rollGroup.Size,
		Parent = bar,
	})
	Ui.corner(barStroke, 0.25)
	Ui.stroke(barStroke, Color3.new(1, 1, 1), 3)

	task.spawn(function()
		-- Idle sheen every few seconds (TweenService, not a frame loop).
		while rollGroup.Parent do
			sheen.Position = UDim2.fromScale(-0.3, -0.5)
			Ui.tween(
				sheen,
				TweenInfo.new(0.7, Enum.EasingStyle.Quad),
				{ Position = UDim2.fromScale(1.2, -0.5) }
			)
			task.wait(3)
		end
	end)

	autoButton = Ui.button({
		Name = "Auto",
		Text = "AUTO\nOFF",
		Size = UDim2.fromScale(0.17, 0.68),
		MaxTextSize = 26,
		Parent = bar,
	}, Ui.Theme.card)
	Ui.stroke(autoButton, Color3.new(1, 1, 1), 2)

	local boostFrame: Frame = Ui.make("Frame", {
		Name = "Boost",
		BackgroundColor3 = Ui.Theme.card,
		Position = UDim2.fromScale(0.83, 0),
		Size = UDim2.fromScale(0.17, 0.68),
		Parent = bar,
	})
	Ui.corner(boostFrame, 0.2)
	Ui.stroke(boostFrame, Ui.Theme.gold, 2)
	boostLabel = Ui.label({
		Text = `x{Config.BOOSTED_ROLL_MULTIPLIER} dans\n{Config.BOOSTED_ROLL_EVERY}`,
		Font = Ui.FONT_TITLE,
		Size = UDim2.fromScale(0.9, 0.9),
		Position = UDim2.fromScale(0.05, 0.05),
		TextColor3 = Ui.Theme.muted,
		MaxTextSize = 22,
		Parent = boostFrame,
	})

	infoLabel = Ui.label({
		Name = "Info",
		Text = "",
		Position = UDim2.fromScale(0, 0.74),
		Size = UDim2.fromScale(1, 0.24),
		TextColor3 = Ui.Theme.text,
		MaxTextSize = 18,
		Parent = bar,
	})
	Ui.textStroke(infoLabel, 1.5)

	-- Reveal card
	reveal = Ui.make("Frame", {
		Name = "Reveal",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.42),
		Size = UDim2.fromScale(0.42, 0.26),
		BackgroundColor3 = Ui.Theme.background,
		BackgroundTransparency = 0.1,
		Visible = false,
		ZIndex = 5,
		Parent = root,
	})
	Ui.aspect(reveal, 2.6)
	Ui.corner(reveal, 0.12)
	revealStroke = Ui.stroke(reveal, Ui.Theme.accent, 3)
	Ui.scaleOf(reveal).Scale = 0

	rarityLabel = Ui.label({
		Font = Ui.FONT_TITLE,
		Position = UDim2.fromScale(0.05, 0.06),
		Size = UDim2.fromScale(0.9, 0.2),
		MaxTextSize = 30,
		ZIndex = 6,
		Parent = reveal,
	})
	Ui.textStroke(rarityLabel, 2)
	nameLabel = Ui.label({
		Font = Ui.FONT_TITLE,
		Position = UDim2.fromScale(0.04, 0.28),
		Size = UDim2.fromScale(0.92, 0.36),
		MaxTextSize = 60,
		ZIndex = 6,
		Parent = reveal,
	})
	Ui.textStroke(nameLabel, 2.5)
	oddsLabel = Ui.label({
		Position = UDim2.fromScale(0.05, 0.68),
		Size = UDim2.fromScale(0.9, 0.2),
		TextColor3 = Ui.Theme.muted,
		MaxTextSize = 26,
		ZIndex = 6,
		Parent = reveal,
	})
	Ui.textStroke(oddsLabel, 1.5)

	newBadge = Ui.label({
		Text = "NOUVEAU !",
		Font = Ui.FONT_TITLE,
		BackgroundTransparency = 0,
		BackgroundColor3 = Ui.Theme.accent2,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.9, 0.05),
		Size = UDim2.fromScale(0.24, 0.2),
		Rotation = 10,
		Visible = false,
		MaxTextSize = 24,
		ZIndex = 8,
		Parent = reveal,
	})
	Ui.corner(newBadge, 0.3)
	Ui.textStroke(newBadge, 1.5)

	bonusLabel = Ui.label({
		Text = "",
		Font = Ui.FONT_TITLE,
		BackgroundTransparency = 0,
		BackgroundColor3 = Ui.Theme.gold,
		TextColor3 = Ui.Theme.background,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.1, 0.05),
		Size = UDim2.fromScale(0.24, 0.2),
		Rotation = -10,
		Visible = false,
		MaxTextSize = 22,
		ZIndex = 8,
		Parent = reveal,
	})
	Ui.corner(bonusLabel, 0.3)

	flash = Ui.make("Frame", {
		Name = "Flash",
		BackgroundColor3 = Color3.new(1, 1, 1),
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 7,
		Parent = reveal,
	})
	Ui.corner(flash, 0.12)
end

function RollController.init()
	rollRemote = Net.func("Roll")
	build()
	setAuto(false)

	rollButton.Activated:Connect(function()
		task.spawn(doRoll)
	end)
	autoButton.Activated:Connect(function()
		setAuto(not autoOn)
	end)
	UserInputService.InputBegan:Connect(function(input: InputObject, gameProcessed: boolean)
		if gameProcessed then
			return
		end
		if input.KeyCode == Enum.KeyCode.R or input.KeyCode == Enum.KeyCode.ButtonX then
			task.spawn(doRoll)
		end
	end)
	StateController.Changed:Connect(renderInfo)
end

return RollController
