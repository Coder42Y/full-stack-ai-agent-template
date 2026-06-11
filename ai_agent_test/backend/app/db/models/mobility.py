"""Shared mobility demo data models."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Station(TimestampMixin, Base):
    """Shanghai shared mobility station or operating area."""

    __tablename__ = "stations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    district: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    station_type: Mapped[str] = mapped_column(String(20), nullable=False)

    distributions: Mapped[list["VehicleDistribution"]] = relationship(
        "VehicleDistribution",
        back_populates="station",
        cascade="all, delete-orphan",
    )
    pickup_orders: Mapped[list["Order"]] = relationship(
        "Order",
        foreign_keys="Order.pickup_station_id",
        back_populates="pickup_station",
    )
    dropoff_orders: Mapped[list["Order"]] = relationship(
        "Order",
        foreign_keys="Order.dropoff_station_id",
        back_populates="dropoff_station",
    )
    weather_records: Mapped[list["Weather"]] = relationship(
        "Weather",
        back_populates="station",
        cascade="all, delete-orphan",
    )
    demand_forecasts: Mapped[list["DemandForecast"]] = relationship(
        "DemandForecast",
        back_populates="station",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("capacity > 0", name="stations_capacity_positive"),
        CheckConstraint(
            "station_type IN ('metro', 'commercial', 'residential', 'industrial', 'park')",
            name="stations_type_valid",
        ),
    )

    def __repr__(self) -> str:
        return f"<Station(id={self.id}, name={self.name}, district={self.district})>"


class VehicleDistribution(TimestampMixin, Base):
    """Hourly vehicle counts for a station."""

    __tablename__ = "vehicle_distribution"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
    )
    bike_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ebike_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scooter_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    station: Mapped[Station] = relationship("Station", back_populates="distributions")

    __table_args__ = (
        CheckConstraint("bike_count >= 0", name="vehicle_distribution_bike_nonnegative"),
        CheckConstraint("ebike_count >= 0", name="vehicle_distribution_ebike_nonnegative"),
        CheckConstraint("scooter_count >= 0", name="vehicle_distribution_scooter_nonnegative"),
        CheckConstraint("total_count >= 0", name="vehicle_distribution_total_nonnegative"),
        Index("ix_vehicle_distribution_station_recorded_at", "station_id", "recorded_at"),
    )

    def __repr__(self) -> str:
        return (
            "<VehicleDistribution("
            f"id={self.id}, station_id={self.station_id}, total_count={self.total_count})>"
        )


class Order(TimestampMixin, Base):
    """Shared mobility ride order."""

    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    vehicle_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    pickup_station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
    )
    dropoff_station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    pickup_station: Mapped[Station] = relationship(
        "Station",
        foreign_keys=[pickup_station_id],
        back_populates="pickup_orders",
    )
    dropoff_station: Mapped[Station] = relationship(
        "Station",
        foreign_keys=[dropoff_station_id],
        back_populates="dropoff_orders",
    )

    __table_args__ = (
        CheckConstraint(
            "vehicle_type IN ('bike', 'ebike', 'scooter')",
            name="orders_vehicle_type_valid",
        ),
        CheckConstraint("amount >= 0", name="orders_amount_nonnegative"),
        CheckConstraint("duration_minutes > 0", name="orders_duration_positive"),
        Index("ix_orders_pickup_station_created_at", "pickup_station_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Order(id={self.id}, vehicle_type={self.vehicle_type}, amount={self.amount})>"


class Weather(TimestampMixin, Base):
    """Daily weather observations near a station."""

    __tablename__ = "weather"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    weather_type: Mapped[str] = mapped_column(String(20), nullable=False)
    temperature: Mapped[float] = mapped_column(Float, nullable=False)
    precipitation_mm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    wind_speed: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    station: Mapped[Station] = relationship("Station", back_populates="weather_records")

    __table_args__ = (
        UniqueConstraint("station_id", "date", name="uq_weather_station_date"),
        CheckConstraint(
            "weather_type IN ('sunny', 'cloudy', 'rainy', 'heavy_rain', 'snow')",
            name="weather_type_valid",
        ),
        CheckConstraint("precipitation_mm >= 0", name="weather_precipitation_nonnegative"),
        CheckConstraint("wind_speed >= 0", name="weather_wind_speed_nonnegative"),
        Index("ix_weather_station_date", "station_id", "date"),
    )

    def __repr__(self) -> str:
        return f"<Weather(id={self.id}, station_id={self.station_id}, date={self.date})>"


class DemandForecast(TimestampMixin, Base):
    """Hourly demand forecast for a station."""

    __tablename__ = "demand_forecast"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
    )
    forecast_date: Mapped[date] = mapped_column(Date, nullable=False)
    hour: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_demand: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    model_version: Mapped[str] = mapped_column(String(20), nullable=False)

    station: Mapped[Station] = relationship("Station", back_populates="demand_forecasts")

    __table_args__ = (
        UniqueConstraint(
            "station_id",
            "forecast_date",
            "hour",
            name="uq_demand_forecast_station_date_hour",
        ),
        CheckConstraint("hour >= 0 AND hour <= 23", name="demand_forecast_hour_range"),
        CheckConstraint(
            "predicted_demand >= 0", name="demand_forecast_predicted_demand_nonnegative"
        ),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 1", name="demand_forecast_confidence_range"
        ),
        Index(
            "ix_demand_forecast_station_date_hour",
            "station_id",
            "forecast_date",
            "hour",
        ),
    )

    def __repr__(self) -> str:
        return (
            "<DemandForecast("
            f"id={self.id}, station_id={self.station_id}, "
            f"forecast_date={self.forecast_date}, hour={self.hour})>"
        )
