--!strict
-- Coins counter (count-up), income, side menu, toasts for announcements.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Characters = require(ReplicatedStorage.Shared.Characters)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Net = require(ReplicatedStorage.Shared.Net)
local Rarities = require(ReplicatedStorage.Shared.Rarities)
local Types = require(ReplicatedStorage.Shared.Types)
local Panels = require(script.Parent.Parent.Lib.Panels)
local Ui = require(script.Parent.Parent.Lib.Ui)
local StateController = require(script.Parent.StateController)

local MAX_TOASTS = 4
local TOAST_SECONDS = 4.5

local HudController = {}

local coinsLabel: TextLabel
local incomeLabel: TextLabel
local menu: Frame
local toastList: Frame
local coinValue: NumberValue
local menuButtons: { [string]: TextButton } = {}

function HudController.addMenuButton(panelName: string, text: string, color: Color3, order: number)
	local button = Ui.button({
		Name = panelName,
		Text = text,
		LayoutOrder = order,
		Size = UDim2.fromScale(1, 0.23),
		MaxTextSize = 22,
		Parent = menu,
	}, color)
	Ui.aspect(button, 1.6)
	Ui.stroke(button, Color3.new(1, 1, 1), 2)
	button.Activated:Connect(function()
		Panels.toggle(panelName)
	end)
	menuButtons[panelName] = button
end

function HudController.toast(text: string, color: Color3?)
	local frame: Frame = Ui.make("Frame", {
		BackgroundColor3 = Ui.Theme.panel,
		Size = UDim2.fromScale(1, 0.22),
		LayoutOrder = math.floor(os.clock() * 1000),
	})
	Ui.corner(frame, 0.3)
	Ui.stroke(frame, color or Ui.Theme.accent, 2)
	local label = Ui.label({
		Text = text,
		RichText = true,
		Size = UDim2.fromScale(0.94, 0.8),
		Position = UDim2.fromScale(0.03, 0.1),
		TextColor3 = color or Ui.Theme.text,
		MaxTextSize = 22,
		Parent = frame,
	})
	Ui.textStroke(label, 1)

	-- Cap concurrent toasts: drop the oldest.
	local toasts = {}
	for _, child in toastList:GetChildren() do
		if child:IsA("Frame") then
			table.insert(toasts, child)
		end
	end
	if #toasts >= MAX_TOASTS then
		table.sort(toasts, function(a, b)
			return a.LayoutOrder < b.LayoutOrder
		end)
		toasts[1]:Destroy()
	end

	local scale = Ui.scaleOf(frame)
	scale.Scale = 0.3
	frame.Parent = toastList
	Ui.tween(scale, Ui.BOUNCY, { Scale = 1 })
	task.delay(TOAST_SECONDS, function()
		if frame.Parent then
			local out = Ui.tween(scale, Ui.FAST, { Scale = 0 })
			out.Completed:Once(function()
				frame:Destroy()
			end)
		end
	end)
end

local function buildHud()
	local root = Ui.root()

	local coinsFrame: Frame = Ui.make("Frame", {
		Name = "Coins",
		Position = UDim2.fromScale(0.012, 0.02),
		Size = UDim2.fromScale(0.2, 0.09),
		BackgroundColor3 = Ui.Theme.panel,
		Parent = root,
	})
	Ui.aspect(coinsFrame, 3.4)
	Ui.corner(coinsFrame, 0.3)
	Ui.stroke(coinsFrame, Ui.Theme.gold, 3)

	coinsLabel = Ui.label({
		Name = "Amount",
		Text = "0",
		Font = Ui.FONT_TITLE,
		TextColor3 = Ui.Theme.gold,
		Position = UDim2.fromScale(0.06, 0.05),
		Size = UDim2.fromScale(0.88, 0.6),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 40,
		Parent = coinsFrame,
	})
	Ui.textStroke(coinsLabel, 2)
	incomeLabel = Ui.label({
		Name = "Income",
		Text = "+0 /s",
		TextColor3 = Ui.Theme.good,
		Position = UDim2.fromScale(0.06, 0.62),
		Size = UDim2.fromScale(0.88, 0.33),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 20,
		Parent = coinsFrame,
	})
	Ui.textStroke(incomeLabel, 1)

	menu = Ui.make("Frame", {
		Name = "Menu",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.fromScale(0.012, 0.5),
		Size = UDim2.fromScale(0.09, 0.42),
		Parent = root,
	})
	Ui.make("UIListLayout", {
		Padding = UDim.new(0.02, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		Parent = menu,
	})

	toastList = Ui.make("Frame", {
		Name = "Toasts",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.5, 0.02),
		Size = UDim2.fromScale(0.45, 0.24),
		Parent = root,
	})
	Ui.make("UIListLayout", {
		Padding = UDim.new(0.03, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = toastList,
	})

	-- Count-up: tween a NumberValue and render it.
	coinValue = Instance.new("NumberValue")
	coinValue.Changed:Connect(function(value: number)
		coinsLabel.Text = Format.short(value)
	end)
end

function HudController.init()
	buildHud()
	HudController.addMenuButton("Inventory", "Persos", Ui.Theme.accent, 1)
	HudController.addMenuButton("Index", "Index", Color3.fromRGB(70, 150, 255), 2)
	HudController.addMenuButton("Shop", "Boutique", Color3.fromRGB(240, 150, 40), 3)

	StateController.CoinsChanged:Connect(function(coins: number)
		if coins > coinValue.Value then
			Ui.pop(coinsLabel, 1.06)
		end
		Ui.tween(coinValue, Ui.COUNT, { Value = coins })
	end)
	StateController.Changed:Connect(function(state: Types.StateSnapshot)
		incomeLabel.Text = `+{Format.short(state.incomePerSecond)} /s`
	end)

	Net.event("Announce").OnClientEvent:Connect(function(announcement: Types.Announcement)
		local def = Characters.get(announcement.characterId)
		if not def then
			return
		end
		local rarity = Rarities[def.rarity]
		local color = if def.rarity == "Secret" then Ui.Theme.text else rarity.color
		local isMe = announcement.playerName == Players.LocalPlayer.DisplayName
		local safeName =
			announcement.playerName:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;")
		HudController.toast(
			`<b>{safeName}</b> a obtenu {Characters.fullName(def)} ({Format.odds(def.oneIn)}) !`,
			color
		)
		if not isMe then
			Ui.sound(Ui.SOUND_REVEAL, 0.4)
		end
	end)
	Net.event("Notify").OnClientEvent:Connect(function(message: string)
		HudController.toast(message, Ui.Theme.muted)
	end)
end

return HudController
