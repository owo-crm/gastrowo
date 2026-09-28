from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import InAppNotification, NotificationTypeEnum, RoleEnum, Task, TaskPhoto, TaskStatusEnum
from app.schemas import TaskCreate, TaskPatch, TaskPhotoCreate
from app.services.notifications import notify_users

router = APIRouter(prefix="/tasks", tags=["tasks"])



def serialize_task(task: Task, photos: list[TaskPhoto]) -> dict:
    return {
        "id": str(task.id),
        "location_id": str(task.location_id) if task.location_id else None,
        "title": task.title,
        "description": task.description,
        "assigned_to": str(task.assigned_to),
        "created_by": str(task.created_by) if task.created_by else None,
        "status": task.status,
        "created_at": task.created_at,
        "completed_at": task.completed_at,
        "photos": [
            {
                "id": str(photo.id),
                "photo_url": photo.photo_url,
                "uploaded_by": str(photo.uploaded_by) if photo.uploaded_by else None,
            }
            for photo in photos
        ],
    }


@router.get("")
def list_tasks(
    status: TaskStatusEnum | None = None,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    query = select(Task).where(Task.organization_id == context.membership.organization_id)
    if context.membership.role == RoleEnum.STAFF:
        query = query.where(or_(Task.assigned_to == context.user.id, Task.created_by == context.user.id))
    if status is not None:
        query = query.where(Task.status == status)
    tasks = db.scalars(query.order_by(Task.created_at.desc())).all()

    task_ids = [task.id for task in tasks]
    photos = db.scalars(select(TaskPhoto).where(TaskPhoto.task_id.in_(task_ids))).all() if task_ids else []
    photos_by_task: dict[UUID, list[TaskPhoto]] = {}
    for photo in photos:
        photos_by_task.setdefault(photo.task_id, []).append(photo)

    data = [serialize_task(task, photos_by_task.get(task.id, [])) for task in tasks]
    return ok(data)


@router.post("")
def create_task(
    payload: TaskCreate,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    task = Task(
        organization_id=context.membership.organization_id,
        location_id=payload.location_id,
        title=payload.title,
        description=payload.description,
        assigned_to=payload.assigned_to,
        created_by=context.user.id,
        status=TaskStatusEnum.PENDING,
    )
    db.add(task)
    db.flush()
    # Only the person who has to do it hears about it, and never about a task they gave themselves.
    if payload.assigned_to != context.user.id:
        notify_users(
            db,
            context.membership.organization_id,
            [payload.assigned_to],
            "New task",
            payload.title,
            notification_type=NotificationTypeEnum.TASK,
            action_url="/tasks",
            entity_kind="task",
            entity_id=str(task.id),
        )
    db.commit()
    db.refresh(task)

    return ok(serialize_task(task, []))


@router.patch("/{task_id}")
def patch_task(
    task_id: UUID,
    payload: TaskPatch,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if task is None or task.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Task not found")

    if context.membership.role == RoleEnum.STAFF and task.assigned_to != context.user.id and task.created_by != context.user.id:
        raise HTTPException(status_code=403, detail="Staff can modify only assigned tasks or tasks created by them")

    task.status = payload.status
    task.completed_at = datetime.now(UTC) if payload.status == TaskStatusEnum.DONE else None
    # The person who asked for it learns it's done; nobody is told about their own action.
    if payload.status == TaskStatusEnum.DONE and task.created_by and task.created_by != context.user.id:
        notify_users(
            db,
            context.membership.organization_id,
            [task.created_by],
            "Task done",
            task.title,
            notification_type=NotificationTypeEnum.TASK,
            action_url="/tasks",
            entity_kind="task",
            entity_id=str(task.id),
        )
    db.commit()

    photos = db.scalars(select(TaskPhoto).where(TaskPhoto.task_id == task.id)).all()
    return ok(serialize_task(task, photos))


@router.delete("/{task_id}")
def delete_task(
    task_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if task is None or task.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Task not found")

    # Clear this task's own notices so nobody opens a task that no longer exists.
    db.execute(delete(InAppNotification).where(InAppNotification.entity_kind == "task", InAppNotification.entity_id == str(task_id)))
    db.execute(delete(TaskPhoto).where(TaskPhoto.task_id == task_id))
    db.delete(task)
    db.commit()
    return ok({"deleted": True, "id": str(task_id)})


@router.post("/{task_id}/photos")
def add_task_photo(
    task_id: UUID,
    payload: TaskPhotoCreate,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if task is None or task.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Task not found")

    if context.membership.role == RoleEnum.STAFF and task.assigned_to != context.user.id and task.created_by != context.user.id:
        raise HTTPException(status_code=403, detail="Staff can upload photo only for assigned tasks or tasks created by them")

    photo = TaskPhoto(task_id=task_id, photo_url=payload.photo_url, uploaded_by=context.user.id)
    db.add(photo)
    db.commit()

    photos = db.scalars(select(TaskPhoto).where(TaskPhoto.task_id == task.id)).all()
    return ok(serialize_task(task, photos))
