extends Node3D
## Карта в духе классической "пыли": респауны T (юг) и CT (север),
## три линии (лонг A, мид, туннели B) и две точки закладки A/B.
## Вся геометрия строится кодом и складывается в NavigationRegion3D,
## навигационная сетка запекается на старте для ботов.

const WALL_H := 3.5
const WALL_COLOR := Color(0.62, 0.58, 0.48)
const FLOOR_COLOR := Color(0.55, 0.5, 0.4)
const CRATE_COLOR := Color(0.48, 0.34, 0.2)
const SITE_COLOR := Color(0.85, 0.55, 0.2, 1.0)

## Точки возрождения команд.
var t_spawns: Array[Vector3] = []
var ct_spawns: Array[Vector3] = []

## Центры и размеры зон закладки.
const SITE_A_CENTER := Vector3(19.0, 0.0, -17.0)
const SITE_B_CENTER := Vector3(-19.0, 0.0, -17.0)
const SITE_SIZE := Vector3(10.0, 4.0, 10.0)

## Ключевые точки карты для патрулирования ботов.
var roam_points: Array[Vector3] = []

## Сетка навигации готова (боты ждут этот флаг).
var nav_baked := false

var _nav_region: NavigationRegion3D
var _materials := {}


func _ready() -> void:
	_build_environment()
	_nav_region = NavigationRegion3D.new()
	add_child(_nav_region)
	_build_geometry()
	_build_sites()
	_build_spawns()
	_build_roam_points()
	_bake_navigation()


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
	# Пол 64x64 (карта от -32 до 32 по обеим осям).
	_add_box(Vector3(0, -0.5, 0), Vector3(64, 1, 64), FLOOR_COLOR)

	# Периметр.
	_add_wall(Vector3(0, 0, -32.5), Vector3(66, WALL_H, 1))
	_add_wall(Vector3(0, 0, 32.5), Vector3(66, WALL_H, 1))
	_add_wall(Vector3(-32.5, 0, 0), Vector3(1, WALL_H, 66))
	_add_wall(Vector3(32.5, 0, 0), Vector3(1, WALL_H, 66))

	# --- Разделение на три линии (z от -10 до 18) ---
	# Стена между туннелями B (запад) и мидом, с проходом у z = 0.
	_add_wall(Vector3(-10, 0, 11.5), Vector3(1, WALL_H, 13))   # z: 5..18
	_add_wall(Vector3(-10, 0, -6.5), Vector3(1, WALL_H, 7))    # z: -10..-3
	# Стена между мидом и лонгом A (восток), с проходом у z = 0.
	_add_wall(Vector3(10, 0, 11.5), Vector3(1, WALL_H, 13))
	_add_wall(Vector3(10, 0, -6.5), Vector3(1, WALL_H, 7))

	# --- Отсечение респауна T от линий: стена по z = 18 с тремя входами ---
	_add_wall(Vector3(-22.5, 0, 18), Vector3(9, WALL_H, 1))   # x: -27..-18
	_add_wall(Vector3(-7.0, 0, 18), Vector3(12, WALL_H, 1))   # x: -13..-1
	_add_wall(Vector3(7.0, 0, 18), Vector3(12, WALL_H, 1))    # x: 1..13
	_add_wall(Vector3(22.5, 0, 18), Vector3(9, WALL_H, 1))    # x: 18..27

	# --- Отсечение респауна CT от точек: стена по z = -24 с двумя входами ---
	_add_wall(Vector3(-24.0, 0, -24), Vector3(10, WALL_H, 1)) # x: -29..-19
	_add_wall(Vector3(0.0, 0, -24), Vector3(22, WALL_H, 1))   # x: -11..11
	_add_wall(Vector3(24.0, 0, -24), Vector3(10, WALL_H, 1))  # x: 19..29

	# --- Стены вокруг точек, образующие входы с мида и с линий ---
	# Точка A: стена с юга (вход с лонга остаётся восточнее) и с запада.
	_add_wall(Vector3(13.5, 0, -10), Vector3(8, WALL_H, 1))   # юг A, x: 9.5..17.5
	_add_wall(Vector3(12, 0, -16.5), Vector3(1, WALL_H, 12))  # запад A, z: -22.5..-10.5
	# Точка B: зеркально.
	_add_wall(Vector3(-13.5, 0, -10), Vector3(8, WALL_H, 1))
	_add_wall(Vector3(-12, 0, -16.5), Vector3(1, WALL_H, 12))

	# --- Укрытия ---
	# Мид.
	_add_crate(Vector3(0, 0, 8), Vector3(2, 2, 2))
	_add_crate(Vector3(-2.5, 0, -2), Vector3(1.5, 1.5, 1.5))
	_add_crate(Vector3(3, 0, -14), Vector3(2, 1.5, 2))
	# Лонг A.
	_add_crate(Vector3(20, 0, 6), Vector3(2, 2, 2))
	_add_crate(Vector3(26, 0, -4), Vector3(1.5, 1.5, 1.5))
	# Туннели B.
	_add_crate(Vector3(-20, 0, 6), Vector3(2, 2, 2))
	_add_crate(Vector3(-26, 0, -4), Vector3(1.5, 1.5, 1.5))
	# Точка A.
	_add_crate(Vector3(18, 0, -15), Vector3(2, 1.5, 2))
	_add_crate(Vector3(22, 0, -20), Vector3(1.5, 1.5, 1.5))
	# Точка B.
	_add_crate(Vector3(-18, 0, -15), Vector3(2, 1.5, 2))
	_add_crate(Vector3(-22, 0, -20), Vector3(1.5, 1.5, 1.5))


## Зоны закладки: подсветка пола и объёмные буквы.
func _build_sites() -> void:
	for site in ["A", "B"]:
		var center := SITE_A_CENTER if site == "A" else SITE_B_CENTER
		var plate := MeshInstance3D.new()
		var mesh := PlaneMesh.new()
		mesh.size = Vector2(SITE_SIZE.x, SITE_SIZE.z)
		var mat := StandardMaterial3D.new()
		mat.albedo_color = SITE_COLOR
		mesh.material = mat
		plate.mesh = mesh
		plate.position = center + Vector3(0, 0.03, 0)
		add_child(plate)

		var label := Label3D.new()
		label.text = site
		label.font_size = 620
		label.modulate = Color(1, 1, 1, 0.85)
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.position = center + Vector3(0, 3.0, 0)
		add_child(label)


func _build_spawns() -> void:
	for i in 5:
		t_spawns.append(Vector3(-6.0 + i * 3.0, 0.1, 27.0))
		ct_spawns.append(Vector3(-6.0 + i * 3.0, 0.1, -28.0))


func _build_roam_points() -> void:
	roam_points = [
		Vector3(0, 0, 12),      # вход в мид
		Vector3(0, 0, -6),      # север мида
		Vector3(20, 0, 10),     # лонг A, юг
		Vector3(20, 0, -6),     # лонг A, север
		Vector3(-20, 0, 10),    # туннели B, юг
		Vector3(-20, 0, -6),    # туннели B, север
		SITE_A_CENTER,
		SITE_B_CENTER,
		Vector3(0, 0, -28),     # респаун CT
		Vector3(0, 0, 27),      # респаун T
	]


## Название точки, внутри которой находится позиция ("A"/"B"/"").
func site_at(pos: Vector3) -> String:
	for site in ["A", "B"]:
		var c := SITE_A_CENTER if site == "A" else SITE_B_CENTER
		if absf(pos.x - c.x) <= SITE_SIZE.x * 0.5 \
				and absf(pos.z - c.z) <= SITE_SIZE.z * 0.5 \
				and pos.y < c.y + SITE_SIZE.y:
			return site
	return ""


## Случайная точка внутри зоны закладки (для ботов).
func random_site_pos(site: String) -> Vector3:
	var c := SITE_A_CENTER if site == "A" else SITE_B_CENTER
	return c + Vector3(
		randf_range(-3.0, 3.0), 0.0, randf_range(-3.0, 3.0))


func site_center(site: String) -> Vector3:
	return SITE_A_CENTER if site == "A" else SITE_B_CENTER


## Запекаем сетку навигации по построенной геометрии.
func _bake_navigation() -> void:
	var nav_mesh := NavigationMesh.new()
	nav_mesh.agent_radius = 0.45
	nav_mesh.agent_height = 1.8
	nav_mesh.cell_size = 0.25
	nav_mesh.cell_height = 0.25
	_nav_region.navigation_mesh = nav_mesh
	_nav_region.bake_finished.connect(func() -> void: nav_baked = true)
	# Запекаем после того, как геометрия попала в дерево сцены.
	_nav_region.bake_navigation_mesh.call_deferred(true)


## Стена стандартной высоты, стоящая на полу.
func _add_wall(pos: Vector3, size: Vector3) -> void:
	_add_box(Vector3(pos.x, size.y * 0.5, pos.z), size, WALL_COLOR)


## Ящик-укрытие, стоящий на полу.
func _add_crate(pos: Vector3, size: Vector3) -> void:
	_add_box(Vector3(pos.x, size.y * 0.5, pos.z), size, CRATE_COLOR)


## Создать короб: видимая грань + статическая коллизия (слой 1 — мир).
## Кладётся внутрь NavigationRegion3D, чтобы попасть в запекание сетки.
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

	_nav_region.add_child(body)


func _material(color: Color) -> StandardMaterial3D:
	if not _materials.has(color):
		var mat := StandardMaterial3D.new()
		mat.albedo_color = color
		_materials[color] = mat
	return _materials[color]
