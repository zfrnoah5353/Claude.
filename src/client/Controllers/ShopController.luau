--!strict
-- Upgrade shop. Shows server-derived values; the server re-checks price and
-- balance on every purchase.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local EconomyLogic = require(ReplicatedStorage.Shared.Util.EconomyLogic)
local Format = require(ReplicatedStorage.Shared.Util.Format)
local Net = require(ReplicatedStorage.Shared.Net)
local Types = require(ReplicatedStorage.Shared.Types)
local Panels = require(script.Parent.Parent.Lib.Panels)
local Ui = require(script.Parent.Parent.Lib.Ui)
local StateController = require(script.Parent.StateController)

type Row = { level: TextLabel, effect: TextLabel, buy: TextButton }

local ShopController = {}

local rows: { [Types.UpgradeId]: Row } = {}

local function effectText(id: Types.UpgradeId, level: number): string
	if id == "luck" then
		return string.format("x%.2f", EconomyLogic.luckMultiplier(level))
	elseif id == "speed" then
		return string.format("%.1f s", EconomyLogic.rollCooldown(level))
	else
		return string.format("x%.2f", EconomyLogic.incomeMultiplier(level))
	end
end

local function render(state: Types.StateSnapshot)
	for id, row in rows do
		local def = Config.UPGRADES[id]
		local level = state.upgrades[id]
		local maxed = level >= def.maxLevel
		row.level.Text = `Niv. {level}/{def.maxLevel}`
		row.effect.Text = if maxed
			then effectText(id, level) .. "  (MAX)"
			else `{effectText(id, level)}  →  {effectText(id, level + 1)}`
		if maxed then
			row.buy.Text = "MAX"
			Ui.setEnabled(row.buy, false)
		else
			local cost = EconomyLogic.upgradeCost(id, level)
			row.buy.Text = `Acheter\n{Format.short(cost)}`
			Ui.setEnabled(row.buy, state.coins >= cost, Ui.Theme.good)
		end
	end
end

function ShopController.init()
	local panel = Panels.create("Shop", "Boutique d'améliorations", Color3.fromRGB(240, 150, 40))
	Ui.label({
		Text = "Les pièces viennent de tes persos équipés et des ventes.",
		TextColor3 = Ui.Theme.muted,
		Size = UDim2.fromScale(1, 1),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 20,
		ZIndex = 12,
		Parent = panel.toolbar,
	})
	Ui.make("UIListLayout", {
		Padding = UDim.new(0, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = panel.content,
	})

	for order, id in Config.UPGRADE_ORDER do
		local def = Config.UPGRADES[id]
		local frame: Frame = Ui.make("Frame", {
			Name = id,
			BackgroundColor3 = Ui.Theme.card,
			LayoutOrder = order,
			Size = UDim2.fromScale(1, 0.3),
			ZIndex = 12,
			Parent = panel.content,
		})
		Ui.aspect(frame, 5.5)
		Ui.corner(frame, 0.15)
		Ui.stroke(frame, Color3.fromRGB(240, 150, 40), 2)

		local name = Ui.label({
			Text = def.displayName,
			Font = Ui.FONT_TITLE,
			Position = UDim2.fromScale(0.03, 0.08),
			Size = UDim2.fromScale(0.45, 0.36),
			TextXAlignment = Enum.TextXAlignment.Left,
			MaxTextSize = 30,
			ZIndex = 13,
			Parent = frame,
		})
		Ui.textStroke(name, 1.5)
		Ui.label({
			Text = def.description,
			TextColor3 = Ui.Theme.muted,
			Position = UDim2.fromScale(0.03, 0.5),
			Size = UDim2.fromScale(0.45, 0.3),
			TextXAlignment = Enum.TextXAlignment.Left,
			MaxTextSize = 18,
			ZIndex = 13,
			Parent = frame,
		})
		local level = Ui.label({
			Text = "",
			Font = Ui.FONT_TITLE,
			TextColor3 = Ui.Theme.gold,
			Position = UDim2.fromScale(0.5, 0.1),
			Size = UDim2.fromScale(0.25, 0.36),
			MaxTextSize = 24,
			ZIndex = 13,
			Parent = frame,
		})
		local effect = Ui.label({
			Text = "",
			TextColor3 = Ui.Theme.good,
			Position = UDim2.fromScale(0.5, 0.52),
			Size = UDim2.fromScale(0.25, 0.32),
			MaxTextSize = 20,
			ZIndex = 13,
			Parent = frame,
		})
		local buy = Ui.button({
			Text = "Acheter",
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.fromScale(0.97, 0.5),
			Size = UDim2.fromScale(0.2, 0.72),
			MaxTextSize = 22,
			ZIndex = 13,
			Parent = frame,
		}, Ui.Theme.good)
		buy.Activated:Connect(function()
			if buy.Active then
				Net.event("BuyUpgrade"):FireServer(id)
			end
		end)
		rows[id] = { level = level, effect = effect, buy = buy }
	end

	StateController.Changed:Connect(render)
	-- Buy buttons light up as coins come in, without waiting for a snapshot.
	StateController.CoinsChanged:Connect(function()
		local state = StateController.get()
		if state and Panels.isOpen("Shop") then
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

return ShopController
