class_name CharacterBase
extends CharacterBody3D
## Общая база для игрока и ботов: здоровье, броня, команда, урон и смерть.
## Оружие и стрельба добавляются на этапе 3.

signal died(victim: CharacterBase, attacker: CharacterBase, weapon_id: String, headshot: bool)
signal health_changed(health: int, armor: int)

## Команда персонажа (GameState.Team).
@export var team: int = GameState.Team.T
## Отображаемое имя (для killfeed и табло).
@export var display_name := "Игрок"

const GRAVITY := 12.0
const EYE_HEIGHT := 1.62

var health := 100
var armor := 0
var has_helmet := false
var alive := true
## Персонаж обездвижен (freeze time перед раундом).
var frozen := false

## Статистика за матч.
var kills := 0
var deaths := 0
var money := 800


func _ready() -> void:
	GameState.register_character(self)


func _exit_tree() -> void:
	GameState.unregister_character(self)


## Точка глаз в мировых координатах — откуда стреляем и смотрим.
func eye_position() -> Vector3:
	return global_position + Vector3(0.0, EYE_HEIGHT, 0.0)


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
	# Тело отключаем из физики; сцену убирает владелец (game.gd).
	collision_layer = 0
	collision_mask = 1


## Полное восстановление к началу раунда.
func reset_for_round() -> void:
	alive = true
	health = 100
	health_changed.emit(health, armor)
	collision_layer = 2
	collision_mask = 3
