"""Create shared mobility demo tables.

Revision ID: 0021_create_mobility_tables
Revises: 0020_add_prompt_active_unique
Create Date: 2026-06-10
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0021_create_mobility_tables"
down_revision = "0020_add_prompt_active_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("district", sa.String(length=50), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("station_type", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("capacity > 0", name="stations_capacity_positive"),
        sa.CheckConstraint(
            "station_type IN ('metro', 'commercial', 'residential', 'industrial', 'park')",
            name="stations_type_valid",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_stations_district", "stations", ["district"], unique=False)

    op.create_table(
        "vehicle_distribution",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("station_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bike_count", sa.Integer(), nullable=False),
        sa.Column("ebike_count", sa.Integer(), nullable=False),
        sa.Column("scooter_count", sa.Integer(), nullable=False),
        sa.Column("total_count", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("bike_count >= 0", name="vehicle_distribution_bike_nonnegative"),
        sa.CheckConstraint("ebike_count >= 0", name="vehicle_distribution_ebike_nonnegative"),
        sa.CheckConstraint("scooter_count >= 0", name="vehicle_distribution_scooter_nonnegative"),
        sa.CheckConstraint("total_count >= 0", name="vehicle_distribution_total_nonnegative"),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_vehicle_distribution_station_recorded_at",
        "vehicle_distribution",
        ["station_id", "recorded_at"],
        unique=False,
    )

    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(length=50), nullable=False),
        sa.Column("vehicle_type", sa.String(length=20), nullable=False),
        sa.Column("pickup_station_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dropoff_station_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount >= 0", name="orders_amount_nonnegative"),
        sa.CheckConstraint("duration_minutes > 0", name="orders_duration_positive"),
        sa.CheckConstraint(
            "vehicle_type IN ('bike', 'ebike', 'scooter')",
            name="orders_vehicle_type_valid",
        ),
        sa.ForeignKeyConstraint(["dropoff_station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pickup_station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_created_at", "orders", ["created_at"], unique=False)
    op.create_index(
        "ix_orders_pickup_station_created_at",
        "orders",
        ["pickup_station_id", "created_at"],
        unique=False,
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"], unique=False)
    op.create_index("ix_orders_vehicle_type", "orders", ["vehicle_type"], unique=False)

    op.create_table(
        "weather",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("station_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("weather_type", sa.String(length=20), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=False),
        sa.Column("precipitation_mm", sa.Float(), nullable=False),
        sa.Column("wind_speed", sa.Float(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("precipitation_mm >= 0", name="weather_precipitation_nonnegative"),
        sa.CheckConstraint(
            "weather_type IN ('sunny', 'cloudy', 'rainy', 'heavy_rain', 'snow')",
            name="weather_type_valid",
        ),
        sa.CheckConstraint("wind_speed >= 0", name="weather_wind_speed_nonnegative"),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("station_id", "date", name="uq_weather_station_date"),
    )
    op.create_index("ix_weather_station_date", "weather", ["station_id", "date"], unique=False)

    op.create_table(
        "demand_forecast",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("station_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("forecast_date", sa.Date(), nullable=False),
        sa.Column("hour", sa.Integer(), nullable=False),
        sa.Column("predicted_demand", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("model_version", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="demand_forecast_confidence_range",
        ),
        sa.CheckConstraint("hour >= 0 AND hour <= 23", name="demand_forecast_hour_range"),
        sa.CheckConstraint(
            "predicted_demand >= 0",
            name="demand_forecast_predicted_demand_nonnegative",
        ),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "station_id",
            "forecast_date",
            "hour",
            name="uq_demand_forecast_station_date_hour",
        ),
    )
    op.create_index(
        "ix_demand_forecast_station_date_hour",
        "demand_forecast",
        ["station_id", "forecast_date", "hour"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_demand_forecast_station_date_hour", table_name="demand_forecast")
    op.drop_table("demand_forecast")
    op.drop_index("ix_weather_station_date", table_name="weather")
    op.drop_table("weather")
    op.drop_index("ix_orders_vehicle_type", table_name="orders")
    op.drop_index("ix_orders_user_id", table_name="orders")
    op.drop_index("ix_orders_pickup_station_created_at", table_name="orders")
    op.drop_index("ix_orders_created_at", table_name="orders")
    op.drop_table("orders")
    op.drop_index(
        "ix_vehicle_distribution_station_recorded_at",
        table_name="vehicle_distribution",
    )
    op.drop_table("vehicle_distribution")
    op.drop_index("ix_stations_district", table_name="stations")
    op.drop_table("stations")
