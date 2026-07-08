extends CharacterBase
## Игрок от первого лица: обзор мышью, передвижение, стрельба,
## вьюмодель оружия и отдача.

const RUN_SPEED := 5.5
const WALK_SPEED := 2.7
const CROUCH_SPEED := 1.8
const JUMP_VELOCITY := 4.6
const ACCEL := 12.0
const CROUCH_EYE := 1.15
const STAND_HEIGHT := 1.8
const CROUCH_HEIGHT := 1.3
const NORMAL_FOV := 90.0
const SCOPE_FOV := 30.0

var look_pitch := 0.0
var crouching := false
var scoped := false

@onready var camera: Camera3D = $Camera
@onready var collision: CollisionShape3D = $Collision

## Держатель вьюмодели оружия (створается кодом под камерой).
var weapon_holder: Node3D


func _ready() -> void:
	super()
	display_name = "Игрок"
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	weapon_holder = Node3D.new()
	weapon_holder.position = Vector3(0.28, -0.22, -0.5)
	camera.add_child(weapon_holder)
	weapon_switched.connect(func(_slot, _id): _rebuild_viewmodel())
	_rebuild_viewmodel()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		# Поворот корпуса по горизонтали, камеры — по вертикали.
		var sens: float = Settings.mouse_sensitivity * (0.35 if scoped else 1.0)
		rotate_y(deg_to_rad(-event.relative.x * sens))
		look_pitch = clampf(look_pitch - event.relative.y * sens, -89.0, 89.0)
		camera.rotation_degrees.x = look_pitch


func _physics_process(delta: float) -> void:
	if not alive:
		return
	if not is_on_floor():
		velocity.y -= GRAVITY * delta

	var wish := Vector3.ZERO
	var controlled := not frozen and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if controlled:
		var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		wish = (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
		if Input.is_action_just_pressed("jump") and is_on_floor():
			velocity.y = JUMP_VELOCITY
		_update_crouch(Input.is_action_pressed("crouch"))
		_handle_weapon_input()

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


func _handle_weapon_input() -> void:
	var w := current_weapon()
	if w == null:
		return
	# Стрельба: автоматы — удержанием, остальное — по клику.
	var wants_fire: bool = Input.is_action_pressed("fire") if w.data().auto \
			else Input.is_action_just_pressed("fire")
	if wants_fire and try_fire(-camera.global_transform.basis.z):
		_apply_recoil(w.data().recoil)
	if Input.is_action_just_pressed("reload"):
		start_reload()
	for slot in [1, 2, 3]:
		if Input.is_action_just_pressed("slot%d" % slot) and slot != current_slot:
			_set_scoped(false)
			switch_slot(slot)
	# Прицел AWP.
	if Input.is_action_just_pressed("aim") and w.id == "awp":
		_set_scoped(not scoped)


func _set_scoped(value: bool) -> void:
	scoped = value
	camera.fov = SCOPE_FOV if scoped else NORMAL_FOV
	if weapon_holder != null:
		weapon_holder.visible = not scoped


## Подброс камеры при выстреле.
func _apply_recoil(recoil: float) -> void:
	look_pitch = clampf(look_pitch + recoil, -89.0, 89.0)
	camera.rotation_degrees.x = look_pitch


## Разброс: больше в движении и в прыжке, меньше на присяде.
## AWP без прицела стреляет очень неточно.
func spread_multiplier() -> float:
	var mult := 1.0
	if not is_on_floor():
		mult *= 4.0
	elif Vector3(velocity.x, 0, velocity.z).length() > 3.0:
		mult *= 2.5
	if crouching:
		mult *= 0.7
	var w := current_weapon()
	if w != null and w.id == "awp" and not scoped:
		mult *= 60.0
	return mult


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


## Простая вьюмодель: корпус и ствол из коробок в цвет оружия.
func _rebuild_viewmodel() -> void:
	if weapon_holder == null:
		return
	for child in weapon_holder.get_children():
		child.queue_free()
	var w := current_weapon()
	if w == null:
		return
	var color: Color = w.data().color
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color

	var body := MeshInstance3D.new()
	var body_mesh := BoxMesh.new()
	body_mesh.material = mat
	if w.is_melee():
		# Нож: узкое лезвие.
		body_mesh.size = Vector3(0.015, 0.05, 0.3)
	else:
		body_mesh.size = Vector3(0.055, 0.09, 0.32)
	body.mesh = body_mesh
	weapon_holder.add_child(body)

	if not w.is_melee():
		var barrel := MeshInstance3D.new()
		var barrel_mesh := BoxMesh.new()
		barrel_mesh.material = mat
		var barrel_len := 0.35 if w.data().slot == 1 else 0.12
		barrel_mesh.size = Vector3(0.03, 0.03, barrel_len)
		barrel.mesh = barrel_mesh
		barrel.position = Vector3(0, 0.025, -0.16 - barrel_len * 0.5)
		weapon_holder.add_child(barrel)
