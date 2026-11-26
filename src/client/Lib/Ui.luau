--!strict
-- UI vocabulary: theme, tween presets, instance helpers and "juice".
-- Everything is Scale-sized so it adapts from phones to ultrawide.

local Players = game:GetService("Players")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Ui = {}

Ui.Theme = table.freeze({
	background = Color3.fromRGB(22, 18, 38),
	panel = Color3.fromRGB(34, 28, 58),
	card = Color3.fromRGB(46, 38, 78),
	accent = Color3.fromRGB(140, 90, 255),
	accent2 = Color3.fromRGB(255, 90, 170),
	gold = Color3.fromRGB(255, 205, 60),
	text = Color3.fromRGB(255, 255, 255),
	muted = Color3.fromRGB(185, 175, 215),
	good = Color3.fromRGB(90, 220, 120),
	bad = Color3.fromRGB(230, 80, 95),
	disabled = Color3.fromRGB(90, 85, 105),
})

Ui.FONT_TITLE = Enum.Font.FredokaOne
Ui.FONT_BODY = Enum.Font.GothamBold

-- Animation vocabulary (reuse these so the whole UI feels coherent).
Ui.FAST = TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
Ui.SMOOTH = TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
Ui.BOUNCY = TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out)
Ui.COUNT = TweenInfo.new(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

Ui.SOUND_CLICK = "rbxasset://sounds/clickfast.wav"
Ui.SOUND_TICK = "rbxasset://sounds/clickfast.wav"
Ui.SOUND_REVEAL = "rbxasset://sounds/electronicpingshort.wav"
Ui.SOUND_RARE = "rbxasset://sounds/victory.wav"
Ui.SOUND_WHOOSH = "rbxasset://sounds/swoosh.wav"

type Props = { [string]: any }

-- Create an instance, apply properties, parent last (cheaper replication/layout).
function Ui.make(className: string, props: Props?, children: { Instance }?): any
	local inst = Instance.new(className) :: any
	local parent = nil
	if props then
		for key, value in props do
			if key == "Parent" then
				parent = value
			else
				inst[key] = value
			end
		end
	end
	if children then
		for _, child in children do
			child.Parent = inst
		end
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

function Ui.corner(parent: GuiObject, scale: number?): UICorner
	return Ui.make("UICorner", { CornerRadius = UDim.new(scale or 0.12, 0), Parent = parent })
end

function Ui.stroke(parent: GuiObject, color: Color3?, thickness: number?): UIStroke
	return Ui.make("UIStroke", {
		Color = color or Color3.new(0, 0, 0),
		Thickness = thickness or 2,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		Parent = parent,
	})
end

function Ui.textStroke(parent: TextLabel | TextButton, thickness: number?): UIStroke
	return Ui.make("UIStroke", {
		Color = Color3.new(0, 0, 0),
		Thickness = thickness or 1.5,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
		Parent = parent,
	})
end

function Ui.padding(parent: GuiObject, scale: number)
	Ui.make("UIPadding", {
		PaddingTop = UDim.new(scale, 0),
		PaddingBottom = UDim.new(scale, 0),
		PaddingLeft = UDim.new(scale, 0),
		PaddingRight = UDim.new(scale, 0),
		Parent = parent,
	})
end

function Ui.aspect(parent: GuiObject, ratio: number)
	Ui.make("UIAspectRatioConstraint", { AspectRatio = ratio, Parent = parent })
end

-- Scaled text bounded so it neither overflows on phones nor becomes a billboard.
function Ui.label(props: Props): TextLabel
	local label: TextLabel = Ui.make("TextLabel", {
		BackgroundTransparency = 1,
		Font = Ui.FONT_BODY,
		TextColor3 = Ui.Theme.text,
		TextScaled = true,
	})
	local maxSize = props.MaxTextSize
	props.MaxTextSize = nil
	for key, value in props do
		(label :: any)[key] = value
	end
	Ui.make(
		"UITextSizeConstraint",
		{ MaxTextSize = maxSize or 48, MinTextSize = 6, Parent = label }
	)
	return label
end

-- Live tweens per element, so a new tween cancels the previous one.
local liveTweens: { [Instance]: Tween } = setmetatable({}, { __mode = "k" }) :: any

function Ui.tween(inst: Instance, info: TweenInfo, goal: Props): Tween
	local previous = liveTweens[inst]
	if previous then
		previous:Cancel()
	end
	local tween = TweenService:Create(inst, info, goal)
	liveTweens[inst] = tween
	tween:Play()
	return tween
end

function Ui.scaleOf(gui: GuiObject): UIScale
	local existing = gui:FindFirstChildOfClass("UIScale")
	if existing then
		return existing
	end
	return Ui.make("UIScale", { Parent = gui })
end

-- Scale pop: 1.1x out and back.
function Ui.pop(gui: GuiObject, amount: number?)
	local scale = Ui.scaleOf(gui)
	scale.Scale = 1
	local out = Ui.tween(scale, Ui.FAST, { Scale = amount or 1.1 })
	out.Completed:Once(function(state)
		if state == Enum.PlaybackState.Completed then
			Ui.tween(scale, TweenInfo.new(0.15, Enum.EasingStyle.Quad), { Scale = 1 })
		end
	end)
end

-- Short shake (big moments only).
function Ui.shake(gui: GuiObject, pixels: number, duration: number)
	local origin = gui.Position
	task.spawn(function()
		local stop = os.clock() + duration
		while os.clock() < stop and gui.Parent do
			gui.Position = origin
				+ UDim2.fromOffset(math.random(-pixels, pixels), math.random(-pixels, pixels))
			task.wait(0.03)
		end
		gui.Position = origin
	end)
end

local soundCache: { [string]: Sound } = {}

function Ui.sound(soundId: string, volume: number?, speed: number?)
	local sound = soundCache[soundId]
	if not sound then
		sound = Instance.new("Sound")
		sound.SoundId = soundId
		sound.Parent = SoundService
		soundCache[soundId] = sound
	end
	sound.Volume = volume or 0.5
	-- Slight random pitch to avoid ear fatigue on repeated sounds.
	sound.PlaybackSpeed = (speed or 1) * (0.94 + math.random() * 0.12)
	SoundService:PlayLocalSound(sound)
end

-- Button with hover / press / disabled states.
function Ui.button(props: Props, color: Color3?): TextButton
	local base = color or Ui.Theme.accent
	local button: TextButton = Ui.make("TextButton", {
		AutoButtonColor = false,
		BackgroundColor3 = base,
		Font = Ui.FONT_TITLE,
		TextColor3 = Ui.Theme.text,
		TextScaled = true,
	})
	local maxSize = props.MaxTextSize
	props.MaxTextSize = nil
	for key, value in props do
		(button :: any)[key] = value
	end
	Ui.make(
		"UITextSizeConstraint",
		{ MaxTextSize = maxSize or 32, MinTextSize = 6, Parent = button }
	)
	Ui.corner(button, 0.2)
	Ui.textStroke(button, 1.5)
	button:SetAttribute("BaseColor", base)

	button.MouseEnter:Connect(function()
		if button.Active then
			Ui.tween(button, Ui.FAST, { BackgroundColor3 = base:Lerp(Color3.new(1, 1, 1), 0.15) })
		end
	end)
	button.MouseLeave:Connect(function()
		local current = button:GetAttribute("BaseColor")
		if button.Active and typeof(current) == "Color3" then
			Ui.tween(button, Ui.FAST, { BackgroundColor3 = current })
		end
	end)
	button.Activated:Connect(function()
		if button.Active then
			Ui.pop(button)
			Ui.sound(Ui.SOUND_CLICK, 0.35)
		end
	end)
	return button
end

function Ui.setEnabled(button: TextButton, enabled: boolean, color: Color3?)
	local base = color or button:GetAttribute("BaseColor")
	if color then
		button:SetAttribute("BaseColor", color)
	end
	button.Active = enabled
	button.AutoButtonColor = false
	local target = if enabled and typeof(base) == "Color3" then base else Ui.Theme.disabled
	Ui.tween(button, Ui.FAST, { BackgroundColor3 = target })
end

local root: ScreenGui? = nil

-- The single ScreenGui for the whole game UI.
function Ui.root(): ScreenGui
	if root then
		return root
	end
	local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
	local gui: ScreenGui = Ui.make("ScreenGui", {
		Name = "AnimeRNG",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		IgnoreGuiInset = false,
		Parent = playerGui,
	})
	root = gui
	return gui
end

return table.freeze(Ui)
