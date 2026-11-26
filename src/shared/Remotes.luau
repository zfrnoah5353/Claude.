--!strict
-- The single list of remotes. The server creates them at startup in one
-- folder; the client only ever waits for them. Adding a remote = one line here.

export type EventName =
	"ClientReady" -- client -> server: controllers are listening, send snapshot
	| "ToggleEquip" -- client -> server: (characterId: string)
	| "EquipBest" -- client -> server: ()
	| "Sell" -- client -> server: (characterId: string, amount: number)
	| "BuyUpgrade" -- client -> server: (upgradeId: string)
	| "Cheat" -- client -> server: (command: string, value: number?) — gated server-side
	| "StateSnapshot" -- server -> client: (Types.StateSnapshot)
	| "CoinsChanged" -- server -> client: (coins: number) — cheap per-second update
	| "Announce" -- server -> all: (Types.Announcement)
	| "Notify" -- server -> client: (message: string)
	| "CheatAccess" -- server -> client: (allowed: boolean)

export type FunctionName = "Roll" -- client -> server: () -> Types.RollResult?

local EVENTS: { EventName } = {
	"ClientReady",
	"ToggleEquip",
	"EquipBest",
	"Sell",
	"BuyUpgrade",
	"Cheat",
	"StateSnapshot",
	"CoinsChanged",
	"Announce",
	"Notify",
	"CheatAccess",
}

local FUNCTIONS: { FunctionName } = { "Roll" }

return table.freeze({
	FOLDER_NAME = "Remotes",
	EVENTS = table.freeze(EVENTS),
	FUNCTIONS = table.freeze(FUNCTIONS),
})
