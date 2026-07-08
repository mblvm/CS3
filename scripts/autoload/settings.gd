extends Node
## Настройки игры и программная раскладка управления (автозагрузка Settings).

## Чувствительность мыши: градусы поворота на пиксель движения.
var mouse_sensitivity := 0.12

## Сложность ботов: 0 — лёгкая, 1 — средняя, 2 — сложная.
var bot_difficulty := 1

const DIFFICULTY_NAMES := ["Лёгкая", "Средняя", "Сложная"]


func _ready() -> void:
	_setup_input_map()


## Регистрируем все действия управления кодом, чтобы не хранить их
## в project.godot вручную.
func _setup_input_map() -> void:
	_add_key("move_forward", KEY_W)
	_add_key("move_back", KEY_S)
	_add_key("move_left", KEY_A)
	_add_key("move_right", KEY_D)
	_add_key("jump", KEY_SPACE)
	_add_key("crouch", KEY_CTRL)
	_add_key("walk", KEY_SHIFT)
	_add_key("reload", KEY_R)
	_add_key("use", KEY_E)
	_add_key("buy", KEY_B)
	_add_key("scoreboard", KEY_TAB)
	_add_key("slot1", KEY_1)
	_add_key("slot2", KEY_2)
	_add_key("slot3", KEY_3)
	_add_key("pause", KEY_ESCAPE)
	_add_mouse("fire", MOUSE_BUTTON_LEFT)
	_add_mouse("aim", MOUSE_BUTTON_RIGHT)


func _add_key(action: String, keycode: Key) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	var ev := InputEventKey.new()
	ev.physical_keycode = keycode
	InputMap.action_add_event(action, ev)


func _add_mouse(action: String, button: MouseButton) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	var ev := InputEventMouseButton.new()
	ev.button_index = button
	InputMap.action_add_event(action, ev)
