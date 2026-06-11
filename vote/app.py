from flask import Flask, render_template, request, make_response, g
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
        if redis_url:
            g.redis = Redis.from_url(
                redis_url, socket_timeout=5, socket_connect_timeout=5
            )
        else:
            redis_host = os.getenv('REDIS_HOST', 'redis')
            g.redis = Redis(
                host=redis_host, db=0,
                socket_timeout=5, socket_connect_timeout=5
            )
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
            # Never let a Redis hiccup turn into a 500 for the voter.
            try:
                redis = get_redis()
                data = json.dumps({'voter_id': voter_id, 'vote': vote})
                redis.rpush('votes', data)
                app.logger.info('Vote recorded: %s (voter %s)', vote, voter_id)
            except Exception as e:
                app.logger.error('Could not push vote to Redis: %s', repr(e))

    resp = make_response(render_template(
        'index.html',
        option_a=option_a,
        option_b=option_b,
        hostname=hostname,
        vote=vote,
    ))
    resp.set_cookie('voter_id', voter_id)
    return resp


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=80, debug=True, threaded=True)
