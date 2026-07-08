extends Node3D
## Корень игрового процесса: собирает карту и игрока.
## Боты и логика раундов добавляются на следующих этапах.

const MapScene := preload("res://scenes/map/map.tscn")
const PlayerScene := preload("res://scenes/player/player.tscn")

var map: Node3D
var player: CharacterBase


func _ready() -> void:
	map = MapScene.instantiate()
	add_child(map)

	player = PlayerScene.instantiate()
	player.team = GameState.Team.CT
	add_child(player)
	player.global_position = map.ct_spawns[0]


func _unhandled_input(event: InputEvent) -> void:
	# Временное управление мышью: Esc — отпустить, клик — захватить.
	if event.is_action_pressed("pause"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseButton and event.pressed \
			and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
