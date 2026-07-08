class_name Weapon
extends RefCounted
## Экземпляр оружия в руках персонажа: патроны, перезарядка, скорострельность.

var id: String
var ammo_mag := 0
var ammo_reserve := 0
var reloading := false

var _reload_end := 0.0
var _next_fire := 0.0


func _init(weapon_id: String) -> void:
	id = weapon_id
	var d := data()
	ammo_mag = maxi(0, d.mag)
	ammo_reserve = d.reserve


func data() -> Dictionary:
	return WeaponDB.data(id)


## Нож — без патронов и перезарядки.
func is_melee() -> bool:
	return data().mag < 0


func can_fire(now: float) -> bool:
	if reloading or now < _next_fire:
		return false
	return is_melee() or ammo_mag > 0


func on_fired(now: float) -> void:
	_next_fire = now + 1.0 / data().fire_rate
	if not is_melee():
		ammo_mag -= 1


func can_reload() -> bool:
	return not is_melee() and not reloading \
			and ammo_mag < data().mag and ammo_reserve > 0


func start_reload(now: float) -> bool:
	if not can_reload():
		return false
	reloading = true
	_reload_end = now + data().reload
	return true


## Смена оружия прерывает перезарядку.
func cancel_reload() -> void:
	reloading = false


## Небольшая задержка после доставания оружия.
func on_drawn(now: float) -> void:
	_next_fire = maxf(_next_fire, now + 0.4)


## Вызывается каждый кадр владельцем: завершает перезарядку.
func update(now: float) -> bool:
	if reloading and now >= _reload_end:
		reloading = false
		var need: int = data().mag - ammo_mag
		var taken: int = mini(need, ammo_reserve)
		ammo_mag += taken
		ammo_reserve -= taken
		return true
	return false
