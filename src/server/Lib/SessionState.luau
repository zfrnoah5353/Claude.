--!strict
-- Transient, per-session player state that is never saved (cooldowns, QA
-- overrides). Shared by several systems without creating require cycles.

local Players = game:GetService("Players")

export type Session = {
	nextRollAt: number, -- earliest server time the next roll is accepted
	luckOverride: number?, -- set only by gated cheat commands
}

local sessions: { [Player]: Session } = {}

local SessionState = {}

function SessionState.get(player: Player): Session
	local session = sessions[player]
	if not session then
		if player.Parent == nil then
			-- Already left: don't recreate an entry that would never be cleaned.
			return { nextRollAt = math.huge, luckOverride = nil }
		end
		session = { nextRollAt = 0, luckOverride = nil }
		sessions[player] = session
	end
	return session
end

Players.PlayerRemoving:Connect(function(player)
	sessions[player] = nil
end)

return table.freeze(SessionState)
