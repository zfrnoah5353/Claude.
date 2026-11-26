--!strict
-- QA panel. Shown only when the server says this player is authorized —
-- and the server re-checks authorization on every command anyway.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = require(ReplicatedStorage.Shared.Net)
local Panels = require(script.Parent.Parent.Lib.Panels)
local Ui = require(script.Parent.Parent.Lib.Ui)
local HudController = require(script.Parent.HudController)

local CheatController = {}

local COMMANDS: { { label: string, command: string, value: number? } } = {
	{ label = "+1M pièces", command = "coins", value = 1_000_000 },
	{ label = "+1B pièces", command = "coins", value = 1_000_000_000 },
	{ label = "Chance x100", command = "luck", value = 100 },
	{ label = "Chance x10 000", command = "luck", value = 10_000 },
	{ label = "Chance normale", command = "luck", value = 1 },
	{ label = "Pity presque plein", command = "pity", value = nil },
	{ label = "Tous les persos", command = "grantAll", value = nil },
	{ label = "Reset profil", command = "reset", value = nil },
}

local built = false

local function build()
	if built then
		return
	end
	built = true
	local accent = Color3.fromRGB(255, 80, 80)
	local panel = Panels.create("Cheat", "QA (Studio / devs)", accent)
	Panels.grid(panel.content, 0.35)
	Ui.label({
		Text = "Ces boutons passent par les vrais systèmes du serveur.",
		TextColor3 = Ui.Theme.muted,
		Size = UDim2.fromScale(1, 1),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 20,
		ZIndex = 12,
		Parent = panel.toolbar,
	})
	for order, entry in COMMANDS do
		local button = Ui.button({
			Text = entry.label,
			LayoutOrder = order,
			MaxTextSize = 22,
			ZIndex = 12,
			Parent = panel.content,
		}, if entry.command == "reset" then Ui.Theme.bad else Ui.Theme.accent)
		button.Activated:Connect(function()
			Net.event("Cheat"):FireServer(entry.command, entry.value)
		end)
	end
	HudController.addMenuButton("Cheat", "QA", accent, 99)
end

function CheatController.init()
	Net.event("CheatAccess").OnClientEvent:Connect(function(allowed: boolean)
		if allowed == true then
			build()
		end
	end)
end

return CheatController
