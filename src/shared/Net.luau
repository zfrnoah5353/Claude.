--!strict
-- Client-side access to remotes. The server creates them (server/Lib/ServerNet);
-- this module only waits for and returns them.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(script.Parent.Remotes)

local Net = {}

local folder: Instance? = nil

local function getFolder(): Instance
	if folder then
		return folder
	end
	local found = ReplicatedStorage:WaitForChild(Remotes.FOLDER_NAME, 30)
	assert(found, "Remotes folder missing — created by the server bootstrap")
	folder = found
	return found
end

function Net.event(name: Remotes.EventName): RemoteEvent
	local remote = getFolder():WaitForChild(name, 30)
	assert(remote and remote:IsA("RemoteEvent"), `remote event {name} missing`)
	return remote
end

function Net.func(name: Remotes.FunctionName): RemoteFunction
	local remote = getFolder():WaitForChild(name, 30)
	assert(remote and remote:IsA("RemoteFunction"), `remote function {name} missing`)
	return remote
end

return table.freeze(Net)
