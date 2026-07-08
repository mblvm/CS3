extends Node3D
## Тестовая площадка: пол, стены и ящики строятся кодом в _ready.
## На этапе 2 заменяется полноценной картой с точками A/B.

## Точки возрождения команд.
var t_spawns: Array[Vector3] = []
var ct_spawns: Array[Vector3] = []

var _materials := {}


func _ready() -> void:
	_build_environment()
	_build_geometry()
	_build_spawns()


func _build_environment() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55.0, -35.0, 0.0)
	sun.shadow_enabled = true
	add_child(sun)

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = Sky.new()
	env.sky.sky_material = ProceduralSkyMaterial.new()
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.7
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)


func _build_geometry() -> void:
	# Пол 40x40.
	_add_box(Vector3(0, -0.5, 0), Vector3(40, 1, 40), Color(0.55, 0.5, 0.42))
	# Периметр.
	_add_box(Vector3(0, 2, -20.5), Vector3(42, 4, 1), Color(0.6, 0.58, 0.5))
	_add_box(Vector3(0, 2, 20.5), Vector3(42, 4, 1), Color(0.6, 0.58, 0.5))
	_add_box(Vector3(-20.5, 2, 0), Vector3(1, 4, 42), Color(0.6, 0.58, 0.5))
	_add_box(Vector3(20.5, 2, 0), Vector3(1, 4, 42), Color(0.6, 0.58, 0.5))
	# Несколько ящиков-укрытий.
	_add_box(Vector3(-5, 0.75, -4), Vector3(1.5, 1.5, 1.5), Color(0.5, 0.35, 0.2))
	_add_box(Vector3(6, 0.75, 3), Vector3(1.5, 1.5, 1.5), Color(0.5, 0.35, 0.2))
	_add_box(Vector3(0, 1.0, 8), Vector3(3, 2, 1.5), Color(0.5, 0.35, 0.2))


func _build_spawns() -> void:
	for i in 5:
		t_spawns.append(Vector3(-14.0 + i * 2.0, 0.1, 16.0))
		ct_spawns.append(Vector3(-14.0 + i * 2.0, 0.1, -16.0))


## Создать ящик: видимая грань + статическая коллизия (слой 1 — мир).
func _add_box(pos: Vector3, size: Vector3, color: Color) -> void:
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.position = pos

	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	box.material = _material(color)
	mesh.mesh = box
	body.add_child(mesh)

	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	body.add_child(col)

	add_child(body)


func _material(color: Color) -> StandardMaterial3D:
	if not _materials.has(color):
		var mat := StandardMaterial3D.new()
		mat.albedo_color = color
		_materials[color] = mat
	return _materials[color]
