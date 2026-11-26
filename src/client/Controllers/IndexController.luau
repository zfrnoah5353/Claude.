--!strict
-- Index panel: every character, hidden until discovered.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Characters = require(ReplicatedStorage.Shared.Characters)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Rarities = require(ReplicatedStorage.Shared.Rarities)
local Types = require(ReplicatedStorage.Shared.Types)
local Panels = require(script.Parent.Parent.Lib.Panels)
local Ui = require(script.Parent.Parent.Lib.Ui)
local StateController = require(script.Parent.StateController)

type Card = { frame: Frame, name: TextLabel, title: TextLabel }

local IndexController = {}

local cards: { [string]: Card } = {}
local progressLabel: TextLabel

local function buildCard(content: ScrollingFrame, def: Types.CharacterDef): Card
	local rarity = Rarities[def.rarity]
	local frame: Frame = Ui.make("Frame", {
		Name = def.id,
		BackgroundColor3 = Ui.Theme.card,
		LayoutOrder = def.oneIn, -- most common first, reads like a ladder
		ZIndex = 12,
		Parent = content,
	})
	Ui.corner(frame, 0.08)
	Ui.stroke(frame, rarity.color, 2)

	Ui.label({
		Text = rarity.displayName,
		TextColor3 = if def.rarity == "Secret" then Ui.Theme.text else rarity.color,
		Position = UDim2.fromScale(0.05, 0.06),
		Size = UDim2.fromScale(0.9, 0.16),
		MaxTextSize = 18,
		ZIndex = 13,
		Parent = frame,
	})
	local name = Ui.label({
		Text = "???",
		Font = Ui.FONT_TITLE,
		Position = UDim2.fromScale(0.05, 0.26),
		Size = UDim2.fromScale(0.9, 0.28),
		MaxTextSize = 34,
		ZIndex = 13,
		Parent = frame,
	})
	Ui.textStroke(name, 2)
	local title = Ui.label({
		Text = "",
		TextColor3 = Ui.Theme.muted,
		Position = UDim2.fromScale(0.05, 0.54),
		Size = UDim2.fromScale(0.9, 0.16),
		MaxTextSize = 18,
		ZIndex = 13,
		Parent = frame,
	})
	Ui.label({
		Text = Format.odds(def.oneIn),
		TextColor3 = Ui.Theme.gold,
		Position = UDim2.fromScale(0.05, 0.76),
		Size = UDim2.fromScale(0.9, 0.16),
		MaxTextSize = 18,
		ZIndex = 13,
		Parent = frame,
	})
	return { frame = frame, name = name, title = title }
end

local function render(state: Types.StateSnapshot)
	local found = 0
	for _, def in Characters.list do
		local card = cards[def.id]
		local discovered = state.discovered[def.id] == true
		local rarity = Rarities[def.rarity]
		if discovered then
			found += 1
			card.name.Text = def.displayName
			card.name.TextColor3 = if def.rarity == "Secret" then Ui.Theme.text else rarity.color
			card.title.Text = def.title
			card.frame.BackgroundColor3 = Ui.Theme.card:Lerp(rarity.color, 0.18)
		else
			card.name.Text = "???"
			card.name.TextColor3 = Ui.Theme.disabled
			card.title.Text = "Pas encore découvert"
			card.frame.BackgroundColor3 = Ui.Theme.card
		end
	end
	progressLabel.Text = `Découverts : {found}/{#Characters.list}`
end

function IndexController.init()
	local panel = Panels.create("Index", "Index des persos", Color3.fromRGB(70, 150, 255))
	Panels.grid(panel.content, 0.85)

	progressLabel = Ui.label({
		Text = "",
		Size = UDim2.fromScale(1, 1),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 24,
		ZIndex = 12,
		Parent = panel.toolbar,
	})

	for _, def in Characters.list do
		cards[def.id] = buildCard(panel.content, def)
	end
	StateController.Changed:Connect(render)
end

return IndexController
