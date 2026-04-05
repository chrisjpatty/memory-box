FROM pgvector/pgvector:pg17
ENV POSTGRES_DB=memory_box
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres
VOLUME /var/lib/postgresql/data
