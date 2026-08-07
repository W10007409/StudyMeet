# 수업 편성 백엔드

## 로컬 DB

    docker run -d --name studymeet-pg \
      -e POSTGRES_USER=studymeet \
      -e POSTGRES_PASSWORD=studymeet \
      -e POSTGRES_DB=studymeet \
      -p 5432:5432 postgres:16

`.env` 를 `.env.example` 에서 복사해 만든다. **`.env` 는 커밋하지 않는다.**

    npm run db:push
    npm run db:generate
    npm run dev

## 시간대

저장은 UTC, **경계 판정은 KST**다. 하루 전 마감·공휴일·슬롯 그리드가 전부 KST 기준이므로
둘을 섞으면 조용히 하루가 어긋난다.

## 공휴일

`Holiday` 테이블에 `YYYY-MM-DD` (KST) 로 넣는다. **대체공휴일을 포함해야 한다.**
매년 갱신되므로 운영자가 수정할 수 있어야 한다.
