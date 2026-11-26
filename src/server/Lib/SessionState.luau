--!strict
-- Transient, per-session player state that is never saved (cooldowns, QA
-- overrides). Shared by several systems without creating require cycles.

local Players = game:GetService("Players")

export type Session = {
	lastRollAt: number,
	luckOverride: number?, -- set only by gated cheat commands
}

local sessions: { [Player]: Session } = {}

local SessionState = {}

function SessionState.get(player: Player): Session
	local session = sessions[player]
	if not session then
		session = { lastRollAt = -math.huge, luckOverride = nil }
		sessions[player] = session
	end
	return session
end

Players.PlayerRemoving:Connect(function(player)
	sessions[player] = nil
end)

return table.freeze(SessionState)
