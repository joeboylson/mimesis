# Running Mimesis in Docker

Docker runs Mimesis without installing Rust or Node. You get the page in
your browser and the `mimesis` command. The desktop app isn't included.

## Start

```sh
git clone https://github.com/joeboylson/mimesis.git
cd mimesis
docker compose up -d
```

Then open <http://localhost:4620>.

Your reviews and images are kept in `~/.mimesis` on your computer, so they
stay put when the container stops or is rebuilt.

## Using the mimesis command

The command is inside the container. Run it with `docker exec`:

```sh
docker exec mimesis mimesis list
docker exec mimesis mimesis guide
```

`mimesis pull` and `mimesis respond` work with files. Put them in your
`~/.mimesis` folder, which the container sees as `/root/.mimesis`:

```sh
docker exec mimesis mimesis pull --review 1 --out /root/.mimesis/pull    # lands in ~/.mimesis/pull
cp new.png ~/.mimesis/new.png
docker exec mimesis mimesis respond 12 /root/.mimesis/new.png -r "1=Made the button green"
```

Your AI can also skip the command and talk to Mimesis over the network.
See [For your AI](for-your-ai.md#over-the-network).

## Updating

```sh
git pull
docker compose up -d --build
```

## Using a different port

Change the number in both places in `docker-compose.yml`, and set
`MIMESIS_PORT` to match. For example, for port 5000:

```yaml
    ports:
      - "127.0.0.1:5000:5000"
    environment:
      MIMESIS_PORT: 5000
```

All three numbers have to be the same. Mimesis turns away requests
addressed to a port other than its own.

## Stopping

```sh
docker compose down
```
