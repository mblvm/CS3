extends CharacterBase
## Игрок от первого лица: обзор мышью, бег/ходьба/присед/прыжок.

const RUN_SPEED := 5.5
const WALK_SPEED := 2.7
const CROUCH_SPEED := 1.8
const JUMP_VELOCITY := 4.6
const ACCEL := 12.0
const CROUCH_EYE := 1.15
const STAND_HEIGHT := 1.8
const CROUCH_HEIGHT := 1.3

var look_pitch := 0.0
var crouching := false

@onready var camera: Camera3D = $Camera
@onready var collision: CollisionShape3D = $Collision


func _ready() -> void:
	super()
	display_name = "Игрок"
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		# Поворот корпуса по горизонтали, камеры — по вертикали.
		rotate_y(deg_to_rad(-event.relative.x * Settings.mouse_sensitivity))
		look_pitch = clampf(
			look_pitch - event.relative.y * Settings.mouse_sensitivity, -89.0, 89.0)
		camera.rotation_degrees.x = look_pitch


func _physics_process(delta: float) -> void:
	if not alive:
		return
	if not is_on_floor():
		velocity.y -= GRAVITY * delta

	var wish := Vector3.ZERO
	if not frozen and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		wish = (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
		if Input.is_action_just_pressed("jump") and is_on_floor():
			velocity.y = JUMP_VELOCITY
		_update_crouch(Input.is_action_pressed("crouch"))

	var speed := RUN_SPEED
	if crouching:
		speed = CROUCH_SPEED
	elif Input.is_action_pressed("walk"):
		speed = WALK_SPEED

	var horizontal := Vector3(velocity.x, 0.0, velocity.z)
	horizontal = horizontal.move_toward(wish * speed, ACCEL * speed * delta)
	velocity.x = horizontal.x
	velocity.z = horizontal.z
	move_and_slide()


func _update_crouch(want_crouch: bool) -> void:
	if crouching == want_crouch:
		return
	crouching = want_crouch
	var shape: CapsuleShape3D = collision.shape
	shape.height = CROUCH_HEIGHT if crouching else STAND_HEIGHT
	collision.position.y = shape.height * 0.5
	camera.position.y = CROUCH_EYE if crouching else EYE_HEIGHT


## Точка глаз с учётом приседа.
func eye_position() -> Vector3:
	return camera.global_position
