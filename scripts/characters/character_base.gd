class_name CharacterBase
extends CharacterBody3D
## Общая база для игрока и ботов: здоровье, броня, команда, урон, смерть,
## инвентарь оружия и hitscan-стрельба.

signal died(victim: CharacterBase, attacker: CharacterBase, weapon_id: String, headshot: bool)
signal health_changed(health: int, armor: int)
signal ammo_changed(mag: int, reserve: int)
signal weapon_switched(slot: int, weapon_id: String)
signal money_changed(money: int)

## Команда персонажа (GameState.Team).
@export var team: int = GameState.Team.T
## Отображаемое имя (для killfeed и табло).
@export var display_name := "Игрок"

const GRAVITY := 12.0
const EYE_HEIGHT := 1.62

var health := 100
var armor := 0
var has_helmet := false
var has_defuse_kit := false
var alive := true
## Персонаж обездвижен (freeze time перед раундом).
var frozen := false

## Статистика за матч.
var kills := 0
var deaths := 0
var money := 800

## Инвентарь: слот -> Weapon (1 — основное, 2 — пистолет, 3 — нож).
var weapons := {}
var current_slot := 3


func _ready() -> void:
	GameState.register_character(self)
	give_weapon("knife")


func _exit_tree() -> void:
	GameState.unregister_character(self)


func _process(_delta: float) -> void:
	var w := current_weapon()
	if w != null and w.update(_now()):
		ammo_changed.emit(w.ammo_mag, w.ammo_reserve)


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0


## Точка глаз в мировых координатах — откуда стреляем и смотрим.
func eye_position() -> Vector3:
	return global_position + Vector3(0.0, EYE_HEIGHT, 0.0)


# --- Оружие ---


func current_weapon() -> Weapon:
	return weapons.get(current_slot)


## Выдать оружие (заменяет оружие в его слоте) и взять его в руки.
func give_weapon(id: String) -> void:
	var w := Weapon.new(id)
	weapons[w.data().slot] = w
	switch_slot(w.data().slot)


func switch_slot(slot: int) -> void:
	if not weapons.has(slot):
		return
	var old := current_weapon()
	if old != null:
		old.cancel_reload()
	current_slot = slot
	var w: Weapon = weapons[slot]
	w.on_drawn(_now())
	weapon_switched.emit(slot, w.id)
	ammo_changed.emit(w.ammo_mag, w.ammo_reserve)


## Множитель разброса от состояния (движение/присед) — переопределяется.
func spread_multiplier() -> float:
	return 1.0


## Выстрел из текущего оружия в направлении aim_dir.
## Возвращает true, если выстрел произошёл.
func try_fire(aim_dir: Vector3) -> bool:
	if not alive or frozen:
		return false
	var w := current_weapon()
	if w == null:
		return false
	var now := _now()
	if not w.can_fire(now):
		# Автоперезарядка при пустом магазине.
		if not w.is_melee() and w.ammo_mag == 0 and not w.reloading:
			start_reload()
		return false
	w.on_fired(now)
	ammo_changed.emit(w.ammo_mag, w.ammo_reserve)
	var d := w.data()
	var dir := _apply_spread(aim_dir.normalized(), d.spread * spread_multiplier())
	_do_hitscan(eye_position(), dir, d, w.id)
	return true


func start_reload() -> void:
	var w := current_weapon()
	if w != null and w.start_reload(_now()):
		ammo_changed.emit(w.ammo_mag, w.ammo_reserve)


## Случайное отклонение в конусе разброса.
func _apply_spread(dir: Vector3, spread_deg: float) -> Vector3:
	if spread_deg <= 0.0:
		return dir
	var right := dir.cross(Vector3.UP)
	if right.length_squared() < 0.01:
		right = Vector3.RIGHT
	right = right.normalized()
	var up := right.cross(dir).normalized()
	var t := tan(deg_to_rad(spread_deg))
	return (dir + right * randf_range(-t, t) + up * randf_range(-t, t)).normalized()


## Луч выстрела: мир (слой 1) + персонажи (слой 2).
func _do_hitscan(origin: Vector3, dir: Vector3, d: Dictionary, weapon_id: String) -> void:
	var to := origin + dir * float(d.range)
	var query := PhysicsRayQueryParameters3D.create(origin, to, 0b11, [get_rid()])
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	var tracer_end := to
	if hit:
		tracer_end = hit.position
		var target := hit.collider
		if target is CharacterBase:
			# Попадание в верхние ~25 см капсулы считаем хедшотом.
			var headshot: bool = hit.position.y >= target.eye_position().y - 0.25
			target.take_damage(d.damage, self, weapon_id, headshot)
			_spawn_impact(hit.position, Color(0.75, 0.1, 0.1), 1.5)
		else:
			_spawn_impact(hit.position, Color(0.12, 0.1, 0.08), 8.0)
	if not d.auto or randi() % 3 == 0:
		_spawn_tracer(origin + dir * 0.6 + Vector3(0, -0.06, 0), tracer_end)


## Светящийся след пули, исчезает мгновенно.
func _spawn_tracer(from: Vector3, to: Vector3) -> void:
	var length := from.distance_to(to)
	if length < 1.0:
		return
	var m := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.015, 0.015, length)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.9, 0.55, 0.8)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	box.material = mat
	m.mesh = box
	get_tree().root.add_child(m)
	m.global_position = (from + to) * 0.5
	var up := Vector3.UP if absf(from.direction_to(to).y) < 0.99 else Vector3.RIGHT
	m.look_at(to, up)
	get_tree().create_timer(0.05).timeout.connect(m.queue_free)


## Отметина попадания (пулевое отверстие или кровь).
func _spawn_impact(pos: Vector3, color: Color, lifetime: float) -> void:
	var m := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.035
	sphere.height = 0.07
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = color
	sphere.material = mat
	m.mesh = sphere
	get_tree().root.add_child(m)
	m.global_position = pos
	get_tree().create_timer(lifetime).timeout.connect(m.queue_free)


# --- Урон и смерть ---


## Нанести урон. Возвращает true, если персонаж погиб от этого урона.
func take_damage(amount: int, attacker: CharacterBase, weapon_id: String, headshot: bool) -> bool:
	if not alive:
		return false
	var dmg := float(amount)
	if headshot:
		dmg *= 4.0
		# Шлем гасит часть урона в голову.
		if has_helmet:
			dmg *= 0.65
	# Кевлар поглощает половину урона по корпусу.
	if armor > 0 and not headshot:
		var absorbed := int(dmg * 0.5)
		armor = maxi(0, armor - maxi(1, absorbed / 2))
		dmg -= absorbed
	health -= maxi(1, int(dmg))
	health_changed.emit(health, armor)
	if health <= 0:
		_die(attacker, weapon_id, headshot)
		return true
	return false


func _die(attacker: CharacterBase, weapon_id: String, headshot: bool) -> void:
	alive = false
	health = 0
	deaths += 1
	if attacker != null and attacker != self:
		attacker.kills += 1
	died.emit(self, attacker, weapon_id, headshot)
	GameState.kill_happened.emit(attacker, self, weapon_id, headshot)
	# Тело больше не мешает пулям и движению.
	collision_layer = 0
	collision_mask = 1


func add_money(amount: int) -> void:
	money = clampi(money + amount, 0, 16000)
	money_changed.emit(money)


## Сброс к началу раунда: здоровье и нож с пистолетом по умолчанию,
## если основное оружие не куплено (вызывает GameState).
func reset_for_round() -> void:
	alive = true
	health = 100
	collision_layer = 2
	collision_mask = 3
	# Броня в CS сохраняется между раундами, если выжил; для простоты оставляем как есть.
	if not weapons.has(2):
		weapons[2] = Weapon.new(WeaponDB.default_pistol(team))
	# Патроны пополняются в начале раунда.
	for slot in weapons:
		var w: Weapon = weapons[slot]
		w.cancel_reload()
		if not w.is_melee():
			w.ammo_mag = w.data().mag
			w.ammo_reserve = w.data().reserve
	switch_slot(1 if weapons.has(1) else 2)
	health_changed.emit(health, armor)
