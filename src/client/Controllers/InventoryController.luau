--!strict
-- Inventory panel: owned characters, equip/unequip, equip best, sell.
-- Cards are created once per character and updated in place (no churn).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Characters = require(ReplicatedStorage.Shared.Characters)
local Config = require(ReplicatedStorage.Shared.Config)
local EconomyLogic = require(ReplicatedStorage.Shared.Util.EconomyLogic)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Net = require(ReplicatedStorage.Shared.Net)
local Rarities = require(ReplicatedStorage.Shared.Rarities)
local Types = require(ReplicatedStorage.Shared.Types)
local Panels = require(script.Parent.Parent.Lib.Panels)
local Ui = require(script.Parent.Parent.Lib.Ui)
local StateController = require(script.Parent.StateController)

type Card = {
	frame: Frame,
	stroke: UIStroke,
	count: TextLabel,
	equip: TextButton,
}

local InventoryController = {}

local cards: { [string]: Card } = {}
local slotsLabel: TextLabel
local emptyLabel: TextLabel

local function buildCard(content: ScrollingFrame, def: Types.CharacterDef): Card
	local rarity = Rarities[def.rarity]
	local isSecret = def.rarity == "Secret"
	local color = if isSecret then Ui.Theme.text else rarity.color

	local frame: Frame = Ui.make("Frame", {
		Name = def.id,
		BackgroundColor3 = Ui.Theme.card:Lerp(rarity.color, 0.15),
		LayoutOrder = -def.oneIn, -- rarest first
		Visible = false,
		ZIndex = 12,
		Parent = content,
	})
	Ui.corner(frame, 0.08)
	local stroke = Ui.stroke(frame, rarity.color, 2)

	Ui.label({
		Text = rarity.displayName,
		TextColor3 = color,
		Position = UDim2.fromScale(0.06, 0.04),
		Size = UDim2.fromScale(0.6, 0.11),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 16,
		ZIndex = 13,
		Parent = frame,
	})
	local count = Ui.label({
		Text = "x0",
		Font = Ui.FONT_TITLE,
		Position = UDim2.fromScale(0.62, 0.04),
		Size = UDim2.fromScale(0.32, 0.12),
		TextXAlignment = Enum.TextXAlignment.Right,
		MaxTextSize = 20,
		ZIndex = 13,
		Parent = frame,
	})
	local name = Ui.label({
		Text = def.displayName,
		Font = Ui.FONT_TITLE,
		TextColor3 = color,
		Position = UDim2.fromScale(0.05, 0.17),
		Size = UDim2.fromScale(0.9, 0.2),
		MaxTextSize = 34,
		ZIndex = 13,
		Parent = frame,
	})
	Ui.textStroke(name, 2)
	Ui.label({
		Text = def.title,
		TextColor3 = Ui.Theme.muted,
		Position = UDim2.fromScale(0.05, 0.37),
		Size = UDim2.fromScale(0.9, 0.12),
		MaxTextSize = 18,
		ZIndex = 13,
		Parent = frame,
	})
	Ui.label({
		Text = `+{Format.short(def.power)} /s  •  {Format.odds(def.oneIn)}`,
		TextColor3 = Ui.Theme.good,
		Position = UDim2.fromScale(0.05, 0.5),
		Size = UDim2.fromScale(0.9, 0.11),
		MaxTextSize = 16,
		ZIndex = 13,
		Parent = frame,
	})

	local equip = Ui.button({
		Text = "Équiper",
		Position = UDim2.fromScale(0.05, 0.65),
		Size = UDim2.fromScale(0.9, 0.15),
		MaxTextSize = 20,
		ZIndex = 13,
		Parent = frame,
	}, Ui.Theme.accent)
	equip.Activated:Connect(function()
		Net.event("ToggleEquip"):FireServer(def.id)
	end)

	local sell = Ui.button({
		Text = `Vendre 1 (+{Format.short(EconomyLogic.sellValue(def))})`,
		Position = UDim2.fromScale(0.05, 0.82),
		Size = UDim2.fromScale(0.9, 0.13),
		MaxTextSize = 16,
		ZIndex = 13,
		Parent = frame,
	}, Color3.fromRGB(200, 120, 40))
	sell.Activated:Connect(function()
		Net.event("Sell"):FireServer(def.id, 1)
	end)

	return { frame = frame, stroke = stroke, count = count, equip = equip }
end

local function render(state: Types.StateSnapshot)
	local owned = 0
	for _, def in Characters.list do
		local card = cards[def.id]
		local count = state.inventory[def.id] or 0
		local equipped = table.find(state.equipped, def.id) ~= nil
		card.frame.Visible = count > 0
		card.count.Text = `x{Format.short(count)}`
		card.equip.Text = if equipped then "Retirer" else "Équiper"
		Ui.setEnabled(card.equip, true, if equipped then Ui.Theme.bad else Ui.Theme.good)
		card.stroke.Thickness = if equipped then 4 else 2
		card.stroke.Color = if equipped then Ui.Theme.gold else Rarities[def.rarity].color
		if count > 0 then
			owned += 1
		end
	end
	slotsLabel.Text =
		`Équipés : {#state.equipped}/{Config.MAX_EQUIPPED}  •  Revenus : +{Format.short(
			state.incomePerSecond
		)} /s`
	emptyLabel.Visible = owned == 0
end

function InventoryController.init()
	local panel = Panels.create("Inventory", "Mes persos", Ui.Theme.accent)
	Panels.grid(panel.content, 1.35)

	slotsLabel = Ui.label({
		Text = "",
		Size = UDim2.fromScale(0.62, 1),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 22,
		ZIndex = 12,
		Parent = panel.toolbar,
	})
	local best = Ui.button({
		Text = "Équiper les meilleurs",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromScale(0.36, 1),
		MaxTextSize = 22,
		ZIndex = 12,
		Parent = panel.toolbar,
	}, Ui.Theme.gold)
	best.Activated:Connect(function()
		Net.event("EquipBest"):FireServer()
	end)

	emptyLabel = Ui.label({
		Text = "Aucun perso pour l'instant. Appuie sur ROLL !",
		TextColor3 = Ui.Theme.muted,
		Position = UDim2.fromScale(0.03, 0.45),
		Size = UDim2.fromScale(0.94, 0.08),
		MaxTextSize = 26,
		ZIndex = 12,
		Parent = panel.frame,
	})

	for _, def in Characters.list do
		cards[def.id] = buildCard(panel.content, def)
	end

	-- Only render while the panel is visible (snapshots arrive often during auto-roll).
	StateController.Changed:Connect(function(state: Types.StateSnapshot)
		if Panels.isOpen("Inventory") then
			render(state)
		end
	end)
	panel.onOpen = function()
		local state = StateController.get()
		if state then
			render(state)
		end
	end
end

return InventoryController
