"""Seed shared mobility demo data."""

import asyncio
import random
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, TypeVar

import click
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.commands import command, info, success, warning
from app.db.models.mobility import (
    DemandForecast,
    Order,
    Station,
    VehicleDistribution,
    Weather,
)
from app.db.session import get_db_context

STATIONS: list[dict[str, Any]] = [
    {
        "name": "张江地铁站",
        "district": "浦东新区",
        "address": "张江高科地铁站 2 号口",
        "lat": 31.204,
        "lng": 121.590,
        "capacity": 160,
        "station_type": "metro",
    },
    {
        "name": "徐家汇商圈",
        "district": "徐汇区",
        "address": "徐家汇地铁站 11 号口",
        "lat": 31.196,
        "lng": 121.436,
        "capacity": 180,
        "station_type": "commercial",
    },
    {
        "name": "陆家嘴",
        "district": "浦东新区",
        "address": "陆家嘴环路银城中路",
        "lat": 31.240,
        "lng": 121.500,
        "capacity": 170,
        "station_type": "commercial",
    },
    {
        "name": "虹桥火车站",
        "district": "闵行区",
        "address": "虹桥综合交通枢纽东广场",
        "lat": 31.195,
        "lng": 121.320,
        "capacity": 220,
        "station_type": "metro",
    },
    {
        "name": "人民广场",
        "district": "黄浦区",
        "address": "人民广场地铁站 8 号口",
        "lat": 31.232,
        "lng": 121.475,
        "capacity": 190,
        "station_type": "metro",
    },
    {
        "name": "静安寺",
        "district": "静安区",
        "address": "南京西路华山路口",
        "lat": 31.224,
        "lng": 121.448,
        "capacity": 150,
        "station_type": "commercial",
    },
    {
        "name": "漕河泾开发区",
        "district": "徐汇区",
        "address": "桂平路田林路口",
        "lat": 31.175,
        "lng": 121.410,
        "capacity": 140,
        "station_type": "industrial",
    },
    {
        "name": "紫竹高新区",
        "district": "闵行区",
        "address": "东川路莲花南路口",
        "lat": 31.020,
        "lng": 121.440,
        "capacity": 130,
        "station_type": "industrial",
    },
    {
        "name": "南京东路步行街",
        "district": "黄浦区",
        "address": "南京东路河南中路口",
        "lat": 31.238,
        "lng": 121.480,
        "capacity": 180,
        "station_type": "commercial",
    },
    {
        "name": "中山公园",
        "district": "长宁区",
        "address": "长宁路定西路口",
        "lat": 31.224,
        "lng": 121.416,
        "capacity": 150,
        "station_type": "park",
    },
    {
        "name": "世纪大道",
        "district": "浦东新区",
        "address": "世纪大道地铁站 6 号口",
        "lat": 31.226,
        "lng": 121.530,
        "capacity": 180,
        "station_type": "metro",
    },
    {
        "name": "嘉定新城",
        "district": "嘉定区",
        "address": "嘉定新城地铁站 1 号口",
        "lat": 31.380,
        "lng": 121.260,
        "capacity": 120,
        "station_type": "residential",
    },
    {
        "name": "松江大学城",
        "district": "松江区",
        "address": "松江大学城地铁站",
        "lat": 31.060,
        "lng": 121.230,
        "capacity": 150,
        "station_type": "residential",
    },
    {
        "name": "浦东国际机场",
        "district": "浦东新区",
        "address": "浦东机场 T2 到达层",
        "lat": 31.144,
        "lng": 121.808,
        "capacity": 210,
        "station_type": "metro",
    },
    {
        "name": "五角场",
        "district": "杨浦区",
        "address": "五角场环岛政通路",
        "lat": 31.300,
        "lng": 121.515,
        "capacity": 170,
        "station_type": "commercial",
    },
    {
        "name": "龙阳路交通枢纽",
        "district": "浦东新区",
        "address": "龙阳路地铁站 3 号口",
        "lat": 31.210,
        "lng": 121.560,
        "capacity": 200,
        "station_type": "metro",
    },
    {
        "name": "上海火车站",
        "district": "静安区",
        "address": "上海站南广场",
        "lat": 31.249,
        "lng": 121.456,
        "capacity": 200,
        "station_type": "metro",
    },
    {
        "name": "虹口足球场",
        "district": "虹口区",
        "address": "东江湾路四川北路口",
        "lat": 31.265,
        "lng": 121.480,
        "capacity": 150,
        "station_type": "metro",
    },
]

VEHICLE_TYPES = ("bike", "ebike", "scooter")
ANOMALY_STATIONS = {
    "徐家汇商圈": 38,
    "张江地铁站": 31,
    "陆家嘴": 27,
    "虹桥火车站": 44,
}
T = TypeVar("T")


def _weighted_choice(items: list[T], weights: list[float]) -> T:
    return random.choices(items, weights=weights, k=1)[0]


def _station_weight(station: Station) -> float:
    weight_by_type = {
        "metro": 1.45,
        "commercial": 1.35,
        "industrial": 1.1,
        "residential": 0.95,
        "park": 0.85,
    }
    return station.capacity * weight_by_type.get(station.station_type, 1.0)


def _peak_hour() -> int:
    if random.random() < 0.58:
        return _weighted_choice([7, 8, 9, 17, 18, 19], [1.0, 1.6, 1.0, 1.2, 1.8, 1.2])
    return random.randint(0, 23)


def _hour_demand_factor(hour: int) -> float:
    if hour in (7, 8, 9):
        return {7: 1.35, 8: 1.8, 9: 1.45}[hour]
    if hour in (17, 18, 19):
        return {17: 1.35, 18: 1.9, 19: 1.5}[hour]
    if 0 <= hour <= 5:
        return 0.22
    if 10 <= hour <= 16:
        return 0.78
    return 0.55


def _base_weather_for_day(offset: int) -> str:
    # Keep rainy/heavy-rain days stable for repeatable demo questions.
    if offset in (1, 5):
        return "rainy"
    if offset == 2:
        return "heavy_rain"
    return _weighted_choice(["sunny", "cloudy", "rainy"], [0.48, 0.37, 0.15])


async def _existing_mobility_rows(db: AsyncSession) -> int:
    result = await db.execute(select(func.count(Station.id)))
    return int(result.scalar_one())


async def _clear_mobility_data(db: AsyncSession) -> None:
    for model in (DemandForecast, Weather, Order, VehicleDistribution, Station):
        await db.execute(delete(model))


async def _seed_stations(db: AsyncSession) -> list[Station]:
    stations = [Station(**station) for station in STATIONS]
    db.add_all(stations)
    await db.flush()
    return stations


def _build_vehicle_distribution(
    stations: list[Station], now: datetime
) -> list[VehicleDistribution]:
    rows: list[VehicleDistribution] = []
    current_hour = now.hour

    for station in stations:
        anomaly_age = ANOMALY_STATIONS.get(station.name)
        for hour in range(24):
            factor = _hour_demand_factor(hour)
            base_total = station.capacity * (0.55 - min(factor, 1.7) * 0.18)
            if 0 <= hour <= 5:
                base_total = station.capacity * 0.72
            if hour in (21, 22, 23):
                base_total = station.capacity * 0.62

            total = max(8, int(random.gauss(base_total, station.capacity * 0.08)))
            hours_ago = (current_hour - hour) % 24
            recorded_at = now - timedelta(hours=hours_ago)

            if anomaly_age and hour == current_hour:
                total = random.randint(68, 138)
                recorded_at = now - timedelta(hours=anomaly_age)

            bike_count = int(total * random.uniform(0.48, 0.58))
            ebike_count = int(total * random.uniform(0.27, 0.34))
            scooter_count = max(0, total - bike_count - ebike_count)

            rows.append(
                VehicleDistribution(
                    station_id=station.id,
                    bike_count=bike_count,
                    ebike_count=ebike_count,
                    scooter_count=scooter_count,
                    total_count=bike_count + ebike_count + scooter_count,
                    recorded_at=recorded_at,
                )
            )
    return rows


def _build_orders(stations: list[Station], days: int, now: datetime) -> list[Order]:
    rows: list[Order] = []
    weights = [_station_weight(station) for station in stations]
    total_orders = max(200, int(days * 67))
    start = datetime.combine((now - timedelta(days=days)).date(), time.min, tzinfo=UTC)

    for _idx in range(total_orders):
        pickup = _weighted_choice(stations, weights)
        dropoff = _weighted_choice(stations, weights)
        if dropoff.id == pickup.id:
            dropoff = random.choice([station for station in stations if station.id != pickup.id])

        day_offset = random.randint(0, max(days - 1, 0))
        hour = _peak_hour()
        minute = random.randint(0, 59)
        second = random.randint(0, 59)
        created_at = start + timedelta(days=day_offset, hours=hour, minutes=minute, seconds=second)

        vehicle_type = _weighted_choice(list(VEHICLE_TYPES), [0.5, 0.3, 0.2])
        amount_base = {"bike": 4.5, "ebike": 7.5, "scooter": 6.0}[vehicle_type]
        duration = max(4, int(random.gauss(18 if hour in (7, 8, 17, 18) else 14, 6)))
        amount = max(1.0, round(random.gauss(amount_base, 2.2) + duration * 0.08, 2))

        rows.append(
            Order(
                user_id=f"user_{random.randint(1, 520):04d}",
                vehicle_type=vehicle_type,
                pickup_station_id=pickup.id,
                dropoff_station_id=dropoff.id,
                amount=amount,
                duration_minutes=duration,
                created_at=created_at,
            )
        )
    return rows


def _build_weather(stations: list[Station], today: date) -> list[Weather]:
    rows: list[Weather] = []
    for offset in range(7):
        weather_type = _base_weather_for_day(offset)
        for station in stations:
            station_weather = weather_type
            if station.district in {"浦东新区", "闵行区"} and offset == 2:
                station_weather = "heavy_rain"

            temp_base = {
                "sunny": 29.5,
                "cloudy": 27.5,
                "rainy": 24.0,
                "heavy_rain": 22.0,
                "snow": 2.0,
            }[station_weather]
            precipitation = {
                "sunny": 0.0,
                "cloudy": random.uniform(0, 1.0),
                "rainy": random.uniform(4.0, 16.0),
                "heavy_rain": random.uniform(28.0, 65.0),
                "snow": random.uniform(1.0, 8.0),
            }[station_weather]

            rows.append(
                Weather(
                    station_id=station.id,
                    date=today + timedelta(days=offset),
                    weather_type=station_weather,
                    temperature=round(random.gauss(temp_base, 2.0), 1),
                    precipitation_mm=round(precipitation, 1),
                    wind_speed=round(random.uniform(1.5, 8.0), 1),
                )
            )
    return rows


def _build_demand_forecast(stations: list[Station], today: date) -> list[DemandForecast]:
    rows: list[DemandForecast] = []
    for offset in range(7):
        weather_type = _base_weather_for_day(offset)
        weather_multiplier = {
            "sunny": 1.0,
            "cloudy": 0.94,
            "rainy": 0.83,
            "heavy_rain": 0.62,
            "snow": 0.35,
        }[weather_type]
        weekday = (today + timedelta(days=offset)).weekday()
        weekday_multiplier = 1.1 if weekday == 0 else 0.95 if weekday == 4 else 1.0

        for station in stations:
            station_multiplier = _station_weight(station) / 160
            for hour in range(24):
                demand = int(
                    18
                    * station_multiplier
                    * _hour_demand_factor(hour)
                    * weather_multiplier
                    * weekday_multiplier
                    + random.uniform(0, 8)
                )
                rows.append(
                    DemandForecast(
                        station_id=station.id,
                        forecast_date=today + timedelta(days=offset),
                        hour=hour,
                        predicted_demand=max(0, demand),
                        confidence=round(random.uniform(0.7, 0.95), 2),
                        model_version="demo-v1",
                    )
                )
    return rows


@command("seed-mobility", help="Seed Shanghai shared mobility demo data")
@click.option("--clear", is_flag=True, help="Clear existing mobility data first")
@click.option("--days", default=30, show_default=True, type=click.IntRange(1, 120))
@click.option("--seed", "seed_value", default=42, show_default=True, type=int)
@click.option("--dry-run", is_flag=True, help="Show planned row counts without writing")
def seed_mobility(clear: bool, days: int, seed_value: int, dry_run: bool) -> None:
    """Seed deterministic shared mobility demo data."""
    random.seed(seed_value)

    if dry_run:
        info("[DRY RUN] Would create mobility demo rows:")
        info(f"- stations: {len(STATIONS)}")
        info(f"- orders: {max(200, int(days * 67))}")
        info(f"- vehicle_distribution: {len(STATIONS) * 24}")
        info(f"- weather: {len(STATIONS) * 7}")
        info(f"- demand_forecast: {len(STATIONS) * 7 * 24}")
        return

    async def _seed() -> None:
        now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        today = now.date()

        async with get_db_context() as db:
            existing = await _existing_mobility_rows(db)
            if existing and not clear:
                warning("Mobility demo data already exists. Use --clear to replace it.")
                return

            if clear:
                info("Clearing existing mobility demo data...")
                await _clear_mobility_data(db)
                await db.flush()

            info("Creating stations...")
            stations = await _seed_stations(db)

            info("Creating vehicle distribution snapshots...")
            distributions = _build_vehicle_distribution(stations, now)
            db.add_all(distributions)

            info("Creating orders...")
            orders = _build_orders(stations, days, now)
            db.add_all(orders)

            info("Creating weather observations...")
            weather = _build_weather(stations, today)
            db.add_all(weather)

            info("Creating demand forecasts...")
            forecasts = _build_demand_forecast(stations, today)
            db.add_all(forecasts)

            success(
                "Created mobility demo data: "
                f"{len(stations)} stations, "
                f"{len(distributions)} distribution rows, "
                f"{len(orders)} orders, "
                f"{len(weather)} weather rows, "
                f"{len(forecasts)} forecast rows."
            )

    asyncio.run(_seed())
