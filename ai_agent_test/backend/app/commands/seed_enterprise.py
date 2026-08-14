"""Seed enterprise employee-assistant (WorkMate) demo data."""

import asyncio
import random
from datetime import UTC, date, datetime, timedelta
from typing import Any

import click
from sqlalchemy import delete, select

from app.commands import command, info, success
from app.db.models.enterprise import Employee, Leave, Reimbursement
from app.db.session import get_db_context

# 确定性员工数据：部门、职位、职级、入职日期
EMPLOYEES: list[dict[str, Any]] = [
    {"name": "张伟", "department": "技术部", "title": "后端工程师", "level": "P3", "hire_date": date(2021, 3, 15)},
    {"name": "李娜", "department": "技术部", "title": "前端工程师", "level": "P2", "hire_date": date(2022, 7, 1)},
    {"name": "王强", "department": "技术部", "title": "测试工程师", "level": "P2", "hire_date": date(2022, 11, 20)},
    {"name": "赵敏", "department": "技术部", "title": "技术经理", "level": "M2", "hire_date": date(2019, 5, 10)},
    {"name": "陈晨", "department": "产品部", "title": "产品经理", "level": "P3", "hire_date": date(2021, 9, 1)},
    {"name": "刘洋", "department": "产品部", "title": "产品设计师", "level": "P2", "hire_date": date(2023, 2, 14)},
    {"name": "孙丽", "department": "市场部", "title": "市场专员", "level": "P2", "hire_date": date(2022, 4, 18)},
    {"name": "周杰", "department": "市场部", "title": "市场经理", "level": "M1", "hire_date": date(2020, 8, 25)},
    {"name": "吴婷", "department": "财务部", "title": "会计", "level": "P2", "hire_date": date(2021, 1, 5)},
    {"name": "郑浩", "department": "财务部", "title": "财务经理", "level": "M2", "hire_date": date(2018, 12, 1)},
    {"name": "冯雪", "department": "人事部", "title": "HR 专员", "level": "P2", "hire_date": date(2022, 6, 6)},
    {"name": "韩磊", "department": "人事部", "title": "HR 经理", "level": "M1", "hire_date": date(2020, 3, 9)},
    {"name": "曹阳", "department": "行政部", "title": "行政专员", "level": "P1", "hire_date": date(2023, 8, 1)},
    {"name": "邓丽", "department": "销售部", "title": "销售经理", "level": "M1", "hire_date": date(2019, 10, 15)},
    {"name": "许飞", "department": "销售部", "title": "销售专员", "level": "P2", "hire_date": date(2023, 1, 3)},
    {"name": "何静", "department": "技术部", "title": "运维工程师", "level": "P2", "hire_date": date(2022, 9, 12)},
]

REIMBURSEMENT_CATEGORIES = ["transport", "meal", "lodging", "office", "travel", "other"]
REIMBURSEMENT_STATUSES = ["pending", "approved", "approved", "paid", "rejected"]
LEAVE_TYPES = ["annual", "annual", "sick", "personal", "other"]
LEAVE_STATUSES = ["approved", "approved", "pending", "rejected"]


def _build_reimbursements(employees: list[Employee], rng: random.Random) -> list[Reimbursement]:
    rows: list[Reimbursement] = []
    now = datetime.now(UTC)
    for employee in employees:
        # 每人 3-8 条报销，覆盖近 3 个月
        count = rng.randint(3, 8)
        for _ in range(count):
            days_ago = rng.randint(0, 90)
            category = rng.choice(REIMBURSEMENT_CATEGORIES)
            base = {
                "transport": (20, 200),
                "meal": (30, 150),
                "lodging": (200, 800),
                "office": (50, 500),
                "travel": (300, 1500),
                "other": (30, 300),
            }[category]
            amount = round(rng.uniform(*base), 2)
            status = rng.choice(REIMBURSEMENT_STATUSES)
            descriptions = {
                "transport": "市内打车 / 地铁通勤",
                "meal": "加班餐补 / 团建餐费",
                "lodging": "出差住宿",
                "office": "办公用品采购",
                "travel": "出差交通 / 住宿",
                "other": "其他杂项",
            }
            rows.append(
                Reimbursement(
                    employee_id=employee.id,
                    category=category,
                    amount=amount,
                    status=status,
                    description=descriptions[category],
                    submitted_at=now - timedelta(days=days_ago),
                )
            )
    return rows


def _build_leaves(employees: list[Employee], rng: random.Random) -> list[Leave]:
    rows: list[Leave] = []
    now = date.today()
    for employee in employees:
        # 每人 1-4 条请假，覆盖近一年
        count = rng.randint(1, 4)
        for _ in range(count):
            leave_type = rng.choice(LEAVE_TYPES)
            days = round(rng.choice([0.5, 1, 1, 2, 3, 5]), 1)
            start = now - timedelta(days=rng.randint(0, 365))
            end = start + timedelta(days=max(0, int(days) - 1))
            rows.append(
                Leave(
                    employee_id=employee.id,
                    leave_type=leave_type,
                    start_date=start,
                    end_date=end,
                    days=days,
                    status=rng.choice(LEAVE_STATUSES),
                )
            )
    return rows


@command("seed-enterprise", help="Seed enterprise employee-assistant demo data")
@click.option("--clear", is_flag=True, help="Clear existing enterprise data before seeding")
@click.option("--seed", "seed_value", default=42, show_default=True, type=int)
def seed_enterprise(clear: bool, seed_value: int) -> None:
    """Create enterprise demo data: employees, reimbursements, leaves."""

    async def _seed() -> None:
        rng = random.Random(seed_value)
        async with get_db_context() as db:
            if clear:
                await db.execute(delete(Reimbursement))
                await db.execute(delete(Leave))
                await db.execute(delete(Employee))

            existing = (await db.execute(select(Employee))).scalars().all()
            if existing:
                info(f"Enterprise data already exists ({len(existing)} employees), skipping.")
                return

            employees: list[Employee] = []
            for item in EMPLOYEES:
                emp = Employee(**item)
                db.add(emp)
                employees.append(emp)
            await db.flush()
            info(f"Created {len(employees)} employees")

            reimbursements = _build_reimbursements(employees, rng)
            db.add_all(reimbursements)
            leaves = _build_leaves(employees, rng)
            db.add_all(leaves)
            await db.flush()

            success(
                f"Created enterprise demo data: {len(employees)} employees, "
                f"{len(reimbursements)} reimbursements, {len(leaves)} leaves."
            )

    asyncio.run(_seed())
