FROM minio/minio
VOLUME /data
CMD ["server", "/data"]
