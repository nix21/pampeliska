FROM alpine:3.22
RUN apk add --no-cache postgresql17-client rclone curl tar gzip tzdata bash
COPY backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh
ENV RCLONE_CONFIG=/config/rclone/rclone.conf
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
