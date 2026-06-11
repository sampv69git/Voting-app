from flask import Flask, render_template, request, make_response, g, jsonify
from redis import Redis
import os
import socket
import random
import json
import logging

option_a = os.getenv('OPTION_A', "Cats")
option_b = os.getenv('OPTION_B', "Dogs")
hostname = socket.gethostname()

app = Flask(__name__)

gunicorn_error_logger = logging.getLogger('gunicorn.error')
app.logger.handlers.extend(gunicorn_error_logger.handlers)
app.logger.setLevel(logging.INFO)


def get_redis():
    if not hasattr(g, 'redis'):
        redis_url = os.getenv('REDIS_URL')
        redis_host = os.getenv('REDIS_HOST', 'redis')
        if redis_url:
            # Full Redis URL provided (e.g. from Railway/Render managed Redis)
            app.logger.info('Connecting to Redis via REDIS_URL')
            g.redis = Redis.from_url(redis_url, socket_timeout=5, socket_connect_timeout=5)
        else:
            # Plain hostname (local Docker compose)
            app.logger.info('Connecting to Redis via host=%s', redis_host)
            g.redis = Redis(host=redis_host, db=0, socket_timeout=5, socket_connect_timeout=5)
    return g.redis


@app.route("/", methods=['POST', 'GET'])
def hello():
    voter_id = request.cookies.get('voter_id')
    if not voter_id:
        voter_id = hex(random.getrandbits(64))[2:-1]

    vote = None

    if request.method == 'POST':
        vote = request.form.get('vote')
        if vote:
            try:
                redis = get_redis()
                data = json.dumps({'voter_id': voter_id, 'vote': vote})
                redis.rpush('votes', data)
                queue_len = redis.llen('votes')
                app.logger.info(
                    'Vote recorded: choice=%s voter=%s | redis queue length now=%s',
                    vote, voter_id, queue_len
                )
            except Exception as e:
                # Log loudly so failures are visible in Railway logs
                app.logger.error('FAILED to push vote to Redis: %s', repr(e))
        else:
            app.logger.warning('POST received with no vote field')

    resp = make_response(render_template(
        'index.html',
        option_a=option_a,
        option_b=option_b,
        hostname=hostname,
        vote=vote,
    ))
    resp.set_cookie('voter_id', voter_id)
    return resp


@app.route("/healthz")
def healthz():
    """Health + Redis connectivity check.

    Open this in a browser. It tries to PING Redis and read the votes queue
    length, so you can confirm the vote app can actually reach Redis.
    """
    info = {"app": "ok"}
    try:
        redis = get_redis()
        info["redis_ping"] = redis.ping()
        info["votes_queue_length"] = redis.llen('votes')
        info["redis"] = "ok"
    except Exception as e:
        info["redis"] = "error"
        info["error"] = repr(e)
        return jsonify(info), 500
    return jsonify(info)


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=80, debug=True, threaded=True)
